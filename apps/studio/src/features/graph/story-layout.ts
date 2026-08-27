import type { NodePosition, ProjectDraft } from '@interactive-drama/domain';

import { STORY_LAYER_GAP, STORY_ROW_GAP } from '../../constants/story-layout.js';

type StoryNodes = ProjectDraft['nodes'];

function createChildren(nodes: StoryNodes) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return new Map(nodes.map((node) => {
    const seen = new Set<string>();
    const targets = [...node.choices]
      .sort((left, right) => left.order - right.order)
      .map((choice) => choice.targetNodeId)
      .filter((targetId) => {
        if (!nodeIds.has(targetId) || seen.has(targetId)) return false;
        seen.add(targetId);
        return true;
      });
    return [node.id, targets] as const;
  }));
}

export function layoutStoryNodes(
  nodes: StoryNodes,
  startNodeId: string | null,
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const nodeIds = new Set(nodes.map((node) => node.id));
  const children = createChildren(nodes);
  const assigned = new Set<string>();

  function layoutComponent(rootId: string, top: number) {
    const componentOrder: string[] = [];
    const component = new Set<string>();
    const primaryChildren = new Map<string, string[]>();

    function discover(nodeId: string) {
      if (assigned.has(nodeId) || component.has(nodeId)) return;
      component.add(nodeId);
      componentOrder.push(nodeId);
      const treeChildren: string[] = [];
      primaryChildren.set(nodeId, treeChildren);

      for (const targetId of children.get(nodeId) ?? []) {
        if (!assigned.has(targetId) && !component.has(targetId)) {
          treeChildren.push(targetId);
          discover(targetId);
        }
      }
    }

    discover(rootId);

    const depths = new Map<string, number>([[rootId, 0]]);
    const indegrees = new Map(componentOrder.map((nodeId) => [nodeId, 0]));
    for (const sourceId of componentOrder) {
      for (const targetId of children.get(sourceId) ?? []) {
        if (component.has(targetId)) {
          indegrees.set(targetId, (indegrees.get(targetId) ?? 0) + 1);
        }
      }
    }

    const queue = componentOrder.filter((nodeId) => indegrees.get(nodeId) === 0);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const sourceId = queue[cursor]!;
      const sourceDepth = depths.get(sourceId) ?? 0;
      for (const targetId of children.get(sourceId) ?? []) {
        if (!component.has(targetId)) continue;
        depths.set(targetId, Math.max(depths.get(targetId) ?? 0, sourceDepth + 1));
        const nextIndegree = (indegrees.get(targetId) ?? 1) - 1;
        indegrees.set(targetId, nextIndegree);
        if (nextIndegree === 0) queue.push(targetId);
      }
    }

    let nextLeafRow = 0;
    const verticalPositions = new Map<string, number>();
    function placeTree(nodeId: string): number {
      const treeChildren = primaryChildren.get(nodeId) ?? [];
      if (treeChildren.length === 0) {
        const y = nextLeafRow * STORY_ROW_GAP;
        nextLeafRow += 1;
        verticalPositions.set(nodeId, y);
        return y;
      }

      const childRows = treeChildren.map(placeTree);
      const y = (childRows[0]! + childRows[childRows.length - 1]!) / 2;
      verticalPositions.set(nodeId, y);
      return y;
    }

    placeTree(rootId);
    let bottom = top;
    for (const nodeId of componentOrder) {
      const y = top + (verticalPositions.get(nodeId) ?? 0);
      positions.set(nodeId, {
        x: (depths.get(nodeId) ?? 0) * STORY_LAYER_GAP,
        y,
      });
      bottom = Math.max(bottom, y);
      assigned.add(nodeId);
    }
    return bottom;
  }

  function findNextRoot() {
    const remainingIds = new Set(
      nodes.filter((node) => !assigned.has(node.id)).map((node) => node.id),
    );
    const hasRemainingParent = new Set<string>();
    for (const sourceId of remainingIds) {
      for (const targetId of children.get(sourceId) ?? []) {
        if (remainingIds.has(targetId)) hasRemainingParent.add(targetId);
      }
    }
    return nodes.find(
      (node) => remainingIds.has(node.id) && !hasRemainingParent.has(node.id),
    )?.id ?? nodes.find((node) => remainingIds.has(node.id))?.id;
  }

  let nextTop = 0;
  if (startNodeId && nodeIds.has(startNodeId)) {
    nextTop = layoutComponent(startNodeId, nextTop) + STORY_ROW_GAP * 2;
  }

  while (assigned.size < nodes.length) {
    const rootId = findNextRoot();
    if (!rootId) break;
    nextTop = layoutComponent(rootId, nextTop) + STORY_ROW_GAP * 2;
  }

  return positions;
}
