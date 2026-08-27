import type {
  ProjectDraft,
  StoryNode,
  ValidationIssue,
} from './types.js';

export function wouldCreateCycle(
  nodes: readonly StoryNode[],
  sourceNodeId: string,
  targetNodeId: string,
): boolean {
  if (sourceNodeId === targetNodeId) {
    return true;
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const pending = [targetNodeId];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (!nodeId || visited.has(nodeId)) {
      continue;
    }
    if (nodeId === sourceNodeId) {
      return true;
    }
    visited.add(nodeId);
    for (const choice of nodesById.get(nodeId)?.choices ?? []) {
      pending.push(choice.targetNodeId);
    }
  }

  return false;
}

function validateNodeShape(
  node: StoryNode,
  nodesById: ReadonlyMap<string, StoryNode>,
  availableAssetIds: ReadonlySet<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (node.type === 'normal' && node.choices.length === 0) {
    issues.push({
      code: 'CHOICE_MISSING',
      nodeId: node.id,
      message: `普通节点“${node.title}”至少需要一个分支`,
    });
  }

  if (node.type === 'ending' && node.choices.length > 0) {
    issues.push({
      code: 'ENDING_HAS_CHOICE',
      nodeId: node.id,
      message: `结局节点“${node.title}”不能再包含分支`,
    });
  }

  const hasVideo = node.videoAssetId !== null &&
    availableAssetIds.has(node.videoAssetId);
  const hasScript = node.scriptText.trim().length > 0;

  if (!hasVideo && !hasScript) {
    issues.push({
      code: 'CONTENT_MISSING',
      nodeId: node.id,
      message: `节点“${node.title}”尚未绑定可用视频或填写剧本`,
    });
  }

  for (const choice of node.choices) {
    if (!nodesById.has(choice.targetNodeId)) {
      issues.push({
        code: 'TARGET_MISSING',
        nodeId: node.id,
        message: `分支“${choice.text}”指向了不存在的节点`,
      });
    }
  }

  return issues;
}

function findCycle(
  startNodeId: string,
  nodesById: ReadonlyMap<string, StoryNode>,
): string | null {
  const visited = new Set<string>();
  const active = new Set<string>();

  function visit(nodeId: string): string | null {
    if (active.has(nodeId)) {
      return nodeId;
    }
    if (visited.has(nodeId)) {
      return null;
    }

    visited.add(nodeId);
    active.add(nodeId);

    const node = nodesById.get(nodeId);
    if (node) {
      for (const choice of node.choices) {
        if (!nodesById.has(choice.targetNodeId)) {
          continue;
        }
        const cycleNodeId = visit(choice.targetNodeId);
        if (cycleNodeId) {
          return cycleNodeId;
        }
      }
    }

    active.delete(nodeId);
    return null;
  }

  return visit(startNodeId);
}

function collectReachable(
  startNodeId: string,
  nodesById: ReadonlyMap<string, StoryNode>,
): Set<string> {
  const reachable = new Set<string>();
  const pending = [startNodeId];

  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (!nodeId || reachable.has(nodeId)) {
      continue;
    }
    reachable.add(nodeId);

    const node = nodesById.get(nodeId);
    for (const choice of node?.choices ?? []) {
      if (nodesById.has(choice.targetNodeId)) {
        pending.push(choice.targetNodeId);
      }
    }
  }

  return reachable;
}

export function validateDraft(draft: ProjectDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodesById = new Map(draft.nodes.map((node) => [node.id, node]));
  const availableAssetIds = new Set(
    draft.assets
      .filter((asset) => asset.status === 'available')
      .map((asset) => asset.id),
  );

  if (draft.startNodeId === null) {
    issues.push({ code: 'START_MISSING', message: '请设置起始节点' });
  } else if (!nodesById.has(draft.startNodeId)) {
    issues.push({
      code: 'START_INVALID',
      message: '起始节点不存在，请重新设置',
    });
  }

  for (const node of draft.nodes) {
    issues.push(...validateNodeShape(node, nodesById, availableAssetIds));
  }

  if (draft.startNodeId !== null && nodesById.has(draft.startNodeId)) {
    const cycleNodeId = findCycle(draft.startNodeId, nodesById);
    if (cycleNodeId) {
      issues.push({
        code: 'GRAPH_CYCLE',
        nodeId: cycleNodeId,
        message: '剧情分支不能形成循环',
      });
    }

    const reachable = collectReachable(draft.startNodeId, nodesById);
    for (const node of draft.nodes) {
      if (!reachable.has(node.id)) {
        issues.push({
          code: 'NODE_UNREACHABLE',
          nodeId: node.id,
          message: `节点“${node.title}”无法从起始节点到达`,
        });
      }
    }
  }

  return issues;
}
