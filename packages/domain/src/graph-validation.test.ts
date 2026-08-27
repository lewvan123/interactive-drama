import { describe, expect, it } from 'vitest';

import { validateDraft, wouldCreateCycle } from './graph-validation.js';
import { validDraft } from './test-fixtures.js';
import type { ProjectDraft } from './types.js';

function cloneDraft(): ProjectDraft {
  return structuredClone(validDraft);
}

describe('validateDraft', () => {
  it('accepts a complete graph with converging branches', () => {
    expect(validateDraft(validDraft)).toEqual([]);
  });

  it('reports a missing start node', () => {
    const draft = cloneDraft();
    draft.startNodeId = null;

    expect(validateDraft(draft)).toContainEqual({
      code: 'START_MISSING',
      message: '请设置起始节点',
    });
  });

  it('reports a choice that points to a missing node', () => {
    const draft = cloneDraft();
    draft.nodes[0]!.choices[0]!.targetNodeId = 'missing';

    expect(validateDraft(draft)).toContainEqual({
      code: 'TARGET_MISSING',
      nodeId: 'start',
      message: '分支“留在家中”指向了不存在的节点',
    });
  });

  it('reports a cycle introduced by a branch', () => {
    const draft = cloneDraft();
    draft.nodes[3]!.type = 'normal';
    draft.nodes[3]!.choices = [
      { id: 'restart', text: '重新开始', targetNodeId: 'start', order: 0 },
    ];

    expect(validateDraft(draft)).toContainEqual({
      code: 'GRAPH_CYCLE',
      nodeId: 'start',
      message: '剧情分支不能形成循环',
    });
  });

  it('reports a node that cannot be reached from the start', () => {
    const draft = cloneDraft();
    draft.nodes[0]!.choices = [draft.nodes[0]!.choices[0]!];

    expect(validateDraft(draft)).toContainEqual({
      code: 'NODE_UNREACHABLE',
      nodeId: 'right',
      message: '节点“搜寻”无法从起始节点到达',
    });
  });

  it('accepts script text when a node has no video', () => {
    const draft = cloneDraft();
    draft.nodes[1]!.videoAssetId = null;

    expect(validateDraft(draft)).toEqual([]);
  });

  it('reports a node with neither video nor script', () => {
    const draft = cloneDraft();
    draft.nodes[1]!.videoAssetId = null;
    draft.nodes[1]!.scriptText = ' \n ';

    expect(validateDraft(draft)).toContainEqual({
      code: 'CONTENT_MISSING',
      nodeId: 'left',
      message: '节点“固守”尚未绑定可用视频或填写剧本',
    });
  });

  it('reports a normal node without choices', () => {
    const draft = cloneDraft();
    draft.nodes[1]!.choices = [];

    expect(validateDraft(draft)).toContainEqual({
      code: 'CHOICE_MISSING',
      nodeId: 'left',
      message: '普通节点“固守”至少需要一个分支',
    });
  });

  it('reports an ending node that still has choices', () => {
    const draft = cloneDraft();
    draft.nodes[3]!.choices = [
      { id: 'restart', text: '重新开始', targetNodeId: 'start', order: 0 },
    ];

    expect(validateDraft(draft)).toContainEqual({
      code: 'ENDING_HAS_CHOICE',
      nodeId: 'ending',
      message: '结局节点“获救”不能再包含分支',
    });
  });
});

describe('wouldCreateCycle', () => {
  it('rejects a connection whose target already reaches the source', () => {
    expect(wouldCreateCycle(validDraft.nodes, 'ending', 'start')).toBe(true);
  });

  it('allows two branches to converge on the same target', () => {
    expect(wouldCreateCycle(validDraft.nodes, 'right', 'ending')).toBe(false);
  });
});
