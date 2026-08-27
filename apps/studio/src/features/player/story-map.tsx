import { isBranchingNode, type PublishedManifest } from '@interactive-drama/domain';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useMemo, useState } from 'react';

import type { PlayerProgress } from './player-progress.js';
import '@xyflow/react/dist/style.css';

export type VisibleStoryNode = {
  id: string;
  title: string;
  locked: boolean;
  current: boolean;
  depth: number;
};

export type VisibleStoryEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  locked: boolean;
};

export type VisibleStoryGraph = {
  nodes: VisibleStoryNode[];
  edges: VisibleStoryEdge[];
};

export function projectVisibleStory(
  manifest: PublishedManifest,
  progress: PlayerProgress,
): VisibleStoryGraph {
  const unlocked = new Set(progress.unlockedNodeIds);
  const exploredChoices = new Set(progress.exploredChoiceIds);
  const visible = new Set(progress.unlockedNodeIds);
  const nodesById = new Map(manifest.nodes.map((node) => [node.id, node]));

  for (const nodeId of unlocked) {
    for (const choice of nodesById.get(nodeId)?.choices ?? []) {
      visible.add(choice.targetNodeId);
    }
  }

  const depths = new Map<string, number>([[manifest.startNodeId, 0]]);
  for (let pass = 0; pass < manifest.nodes.length; pass += 1) {
    for (const node of manifest.nodes) {
      const sourceDepth = depths.get(node.id);
      if (sourceDepth === undefined) continue;
      for (const choice of node.choices) {
        if (!visible.has(choice.targetNodeId)) continue;
        depths.set(
          choice.targetNodeId,
          Math.max(depths.get(choice.targetNodeId) ?? 0, sourceDepth + 1),
        );
      }
    }
  }

  const nodes = manifest.nodes
    .filter((node) => visible.has(node.id))
    .map((node) => ({
      id: node.id,
      title: unlocked.has(node.id) ? node.title : '未解锁',
      locked: !unlocked.has(node.id),
      current: node.id === progress.currentNodeId,
      depth: depths.get(node.id) ?? 0,
    }));
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = manifest.nodes
    .filter((node) => unlocked.has(node.id))
    .flatMap((node) => node.choices
      .filter((choice) => visibleIds.has(choice.targetNodeId))
      .map((choice) => ({
        id: choice.id,
        source: node.id,
        target: choice.targetNodeId,
        label: isBranchingNode(node)
          ? (exploredChoices.has(choice.id) ? choice.text : '未知分支')
          : '',
        locked: !exploredChoices.has(choice.id),
      })));

  return { nodes, edges };
}

type MapNodeData = {
  title: string;
  locked: boolean;
  current: boolean;
  onSelect: () => void;
};

type MapFlowNode = Node<MapNodeData, 'storyMap'>;

function StoryMapNode({ data }: NodeProps<MapFlowNode>) {
  return (
    <button
      type="button"
      className={`story-map-node${data.locked ? ' is-locked' : ''}${data.current ? ' is-current' : ''}`}
      disabled={data.locked || data.current}
      onClick={data.onSelect}
    >
      {data.current && <span>当前剧情</span>}
      <strong>{data.title}</strong>
    </button>
  );
}

const nodeTypes = { storyMap: StoryMapNode };

export function StoryMap({
  manifest,
  progress,
  onRevisit,
  onClose,
}: {
  manifest: PublishedManifest;
  progress: PlayerProgress;
  onRevisit: (nodeId: string) => void;
  onClose: () => void;
}) {
  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null);
  const graph = useMemo(
    () => projectVisibleStory(manifest, progress),
    [manifest, progress],
  );
  const pendingNode = graph.nodes.find((node) => node.id === pendingNodeId);
  const flowNodes = useMemo<MapFlowNode[]>(() => {
    const rowsByDepth = new Map<number, number>();
    return graph.nodes.map((node) => {
      const row = rowsByDepth.get(node.depth) ?? 0;
      rowsByDepth.set(node.depth, row + 1);
      return {
        id: node.id,
        type: 'storyMap',
        position: { x: node.depth * 220, y: row * 120 },
        data: {
          title: node.title,
          locked: node.locked,
          current: node.current,
          onSelect: () => setPendingNodeId(node.id),
        },
      };
    });
  }, [graph.nodes]);
  const flowEdges = useMemo<Edge[]>(() => graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: edge.locked ? '#515651' : '#a4e47a' },
    labelStyle: { fill: edge.locked ? '#777d77' : '#dcefd0' },
  })), [graph.edges]);

  return (
    <section className="story-map-overlay" aria-label="剧情图谱">
      <header className="story-map-header">
        <div>
          <span>探索进度</span>
          <h2>剧情图谱</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭剧情图谱">关闭</button>
      </header>
      <div className="story-map-canvas">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          minZoom={0.35}
          maxZoom={1.4}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {pendingNode && (
        <div className="story-map-confirm" role="dialog" aria-modal="true">
          <p>将从“{pendingNode.title}”重新播放，已解锁剧情不会丢失</p>
          <div>
            <button type="button" onClick={() => setPendingNodeId(null)}>取消</button>
            <button
              type="button"
              onClick={() => {
                onRevisit(pendingNode.id);
                setPendingNodeId(null);
              }}
            >
              确认回溯
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
