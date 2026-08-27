import { describe, expect, it } from 'vitest';

import { buildPublishedManifest } from './manifest.js';
import { validDraft } from './test-fixtures.js';

describe('buildPublishedManifest', () => {
  it('keeps only runtime fields needed by the player', () => {
    const manifest = buildPublishedManifest(validDraft, 'v1');

    expect(manifest).toEqual({
      projectId: 'ice-world',
      title: '全球冰封',
      version: 'v1',
      startNodeId: 'start',
      nodes: [
        {
          id: 'start',
          title: '暴雪来临',
          type: 'normal',
          videoUrl: '/media/start.mp4',
          choices: [
            { id: 'go-left', text: '留在家中', targetNodeId: 'left', order: 0 },
            { id: 'go-right', text: '外出寻找物资', targetNodeId: 'right', order: 1 },
          ],
        },
        {
          id: 'left',
          title: '固守',
          type: 'normal',
          videoUrl: '/media/left.mp4',
          choices: [
            { id: 'left-end', text: '等待救援', targetNodeId: 'ending', order: 0 },
          ],
        },
        {
          id: 'right',
          title: '搜寻',
          type: 'normal',
          videoUrl: '/media/right.mp4',
          choices: [
            { id: 'right-end', text: '返回住处', targetNodeId: 'ending', order: 0 },
          ],
        },
        {
          id: 'ending',
          title: '获救',
          type: 'ending',
          videoUrl: '/media/ending.mp4',
          choices: [],
        },
      ],
    });
    expect(JSON.stringify(manifest)).not.toContain('scriptText');
    expect(JSON.stringify(manifest)).not.toContain('position');
    expect(JSON.stringify(manifest)).not.toContain('objectKey');
  });

  it('refuses to publish an invalid draft', () => {
    const invalidDraft = structuredClone(validDraft);
    invalidDraft.nodes[0]!.videoAssetId = null;
    invalidDraft.nodes[0]!.scriptText = '';

    expect(() => buildPublishedManifest(invalidDraft, 'v2')).toThrow(
      '剧情草稿未通过发布检查',
    );
  });

  it('publishes script text only when a node has no video', () => {
    const scriptDraft = structuredClone(validDraft);
    scriptDraft.nodes[1]!.videoAssetId = null;
    scriptDraft.nodes[1]!.scriptText = '  第一段。\n\n第二段。  ';

    const manifest = buildPublishedManifest(scriptDraft, 'v2');
    const videoNode = manifest.nodes.find((node) => node.id === 'start');
    const scriptNode = manifest.nodes.find((node) => node.id === 'left');

    expect(videoNode).toHaveProperty('videoUrl', '/media/start.mp4');
    expect(videoNode).not.toHaveProperty('scriptText');
    expect(scriptNode).toMatchObject({
      id: 'left',
      scriptText: '第一段。\n\n第二段。',
    });
    expect(scriptNode).not.toHaveProperty('videoUrl');
  });

  it('publishes the custom prompt for a branching node', () => {
    const promptDraft = structuredClone(validDraft);
    Object.assign(promptDraft.nodes[0]!, { choicePrompt: '  要不要开门救她  ' });

    const manifest = buildPublishedManifest(promptDraft, 'v2');

    expect(manifest.nodes[0]).toHaveProperty('choicePrompt', '要不要开门救她');
  });
});
