import { isBranchingNode, type ProjectDraft } from '@interactive-drama/domain';
import { ApartmentOutlined, UndoOutlined } from '@ant-design/icons';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  ConnectionLineType,
  ControlButton,
  Controls,
  MarkerType,
  ReactFlow,
  type BuiltInEdge,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type EdgeProps,
  type NodeMouseHandler,
  useReactFlow,
} from '@xyflow/react';
import { message } from 'antd';
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';

import { draftStore, type DraftStore } from '../../stores/draft-store.js';
import { STORY_LAYER_GAP } from '../../constants/story-layout.js';
import { layoutStoryNodes } from './story-layout.js';
import { StoryNodeCard, type StoryFlowNode } from './story-node-card.js';
import '@xyflow/react/dist/style.css';

const nodeTypes = { story: StoryNodeCard };
const DETOUR_NODE_HEIGHT = 104;
const DETOUR_MARGIN = 44;
const DETOUR_LANE_GAP = 32;
const DETOUR_STUB = 40;

type StoryDetourData = {
  routeY: number;
};

type StoryDetourFlowEdge = Edge<StoryDetourData, 'story-detour'>;
type StoryFlowEdge = BuiltInEdge | StoryDetourFlowEdge;

function StoryDetourEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  interactionWidth,
}: EdgeProps<StoryDetourFlowEdge>) {
  const routeY = data?.routeY ?? (sourceY + targetY) / 2;
  const sourceBendX = sourceX + DETOUR_STUB;
  const targetBendX = targetX - DETOUR_STUB;
  const path = [
    `M ${sourceX} ${sourceY}`,
    `H ${sourceBendX}`,
    `V ${routeY}`,
    `H ${targetBendX}`,
    `V ${targetY}`,
    `H ${targetX}`,
  ].join(' ');

  return (
    <BaseEdge
      path={path}
      labelX={(sourceBendX + targetBendX) / 2}
      labelY={routeY}
      {...(markerEnd !== undefined ? { markerEnd } : {})}
      {...(style !== undefined ? { style } : {})}
      {...(label !== undefined ? { label } : {})}
      {...(labelStyle !== undefined ? { labelStyle } : {})}
      {...(labelShowBg !== undefined ? { labelShowBg } : {})}
      {...(labelBgStyle !== undefined ? { labelBgStyle } : {})}
      {...(labelBgPadding !== undefined ? { labelBgPadding } : {})}
      {...(labelBgBorderRadius !== undefined ? { labelBgBorderRadius } : {})}
      {...(interactionWidth !== undefined ? { interactionWidth } : {})}
    />
  );
}

const edgeTypes = { 'story-detour': StoryDetourEdge };

function createTargetHandles(
  nodes: ProjectDraft['nodes'],
  positions: Map<string, { x: number; y: number }>,
) {
  type TargetHandle = { id: string | null; top: number };
  const incomingByNode = new Map(nodes.map((node) => [node.id, [] as Array<{
    id: string;
    sourceId: string;
    order: number;
  }>]));

  for (const source of nodes) {
    for (const choice of source.choices) {
      incomingByNode.get(choice.targetNodeId)?.push({
        id: choice.id,
        sourceId: source.id,
        order: choice.order,
      });
    }
  }

  return new Map<string, TargetHandle[]>(nodes.map((node): [string, TargetHandle[]] => {
    const incoming = incomingByNode.get(node.id) ?? [];
    incoming.sort((left, right) => {
      const leftPosition = positions.get(left.sourceId);
      const rightPosition = positions.get(right.sourceId);
      return (leftPosition?.y ?? 0) - (rightPosition?.y ?? 0)
        || (leftPosition?.x ?? 0) - (rightPosition?.x ?? 0)
        || left.order - right.order;
    });

    if (incoming.length === 0) {
      return [node.id, [{ id: null, top: 50 }]];
    }
    if (incoming.length === 1) {
      return [node.id, [{ id: incoming[0]!.id, top: 50 }]];
    }

    const span = Math.min(60, (incoming.length - 1) * 32);
    const start = 50 - span / 2;
    return [node.id, incoming.map((connection, index) => ({
      id: connection.id,
      top: start + (index / (incoming.length - 1)) * span,
    }))];
  }));
}

export type NodeDeletionPolicy = 'blocked' | 'direct';

export function classifyNodeDeletion(
  draft: ProjectDraft,
  nodeId: string,
): NodeDeletionPolicy {
  const node = draft.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || draft.startNodeId === nodeId || node.type === 'ending') {
    return 'blocked';
  }
  return 'direct';
}

function isTextEditingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.matches('input, textarea, select') ||
    target.isContentEditable
  );
}

export function createStoryEdges(
  nodes: ProjectDraft['nodes'],
  positions = new Map(nodes.map((node) => [node.id, node.position])),
  selectedChoiceId: string | null = null,
): StoryFlowEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const connections = nodes.flatMap((node) =>
    node.choices
      .filter((choice) => nodeIds.has(choice.targetNodeId))
      .map((choice) => ({ node, choice })),
  );
  const sourcesByLayer = new Map<string, string[]>();

  for (const { node, choice } of connections) {
    const sourcePosition = positions.get(node.id);
    const targetPosition = positions.get(choice.targetNodeId);
    if (!sourcePosition || !targetPosition) continue;
    const layerKey = `${sourcePosition.x}:${targetPosition.x}`;
    const sourceIds = sourcesByLayer.get(layerKey) ?? [];
    if (!sourceIds.includes(node.id)) sourceIds.push(node.id);
    sourcesByLayer.set(layerKey, sourceIds);
  }

  for (const sourceIds of sourcesByLayer.values()) {
    sourceIds.sort((leftId, rightId) => (
      (positions.get(leftId)?.y ?? 0) - (positions.get(rightId)?.y ?? 0)
    ));
  }

  const detourRoutes = new Map<string, StoryDetourData>();
  const occupiedRoutes: Record<'top' | 'bottom', Array<{
    minX: number;
    maxX: number;
    routeY: number;
  }>> = { top: [], bottom: [] };

  for (const { node, choice } of connections) {
    const sourcePosition = positions.get(node.id);
    const targetPosition = positions.get(choice.targetNodeId);
    if (
      !sourcePosition ||
      !targetPosition ||
      targetPosition.x - sourcePosition.x <= STORY_LAYER_GAP + 1
    ) {
      continue;
    }

    const minX = sourcePosition.x;
    const maxX = targetPosition.x;
    const nodesInSpan = nodes
      .map((candidate) => positions.get(candidate.id))
      .filter((position): position is { x: number; y: number } => (
        Boolean(position) && position!.x >= minX && position!.x <= maxX
      ));
    const minY = Math.min(...nodesInSpan.map((position) => position.y));
    const maxY = Math.max(...nodesInSpan.map((position) => position.y));
    const topBase = minY - DETOUR_MARGIN;
    const bottomBase = maxY + DETOUR_NODE_HEIGHT + DETOUR_MARGIN;
    const sourceCenterY = sourcePosition.y + DETOUR_NODE_HEIGHT / 2;
    const targetCenterY = targetPosition.y + DETOUR_NODE_HEIGHT / 2;
    const topCost = Math.abs(sourceCenterY - topBase) + Math.abs(targetCenterY - topBase);
    const bottomCost = Math.abs(sourceCenterY - bottomBase) + Math.abs(targetCenterY - bottomBase);
    const side = topCost < bottomCost ? 'top' : 'bottom';
    const occupied = occupiedRoutes[side];
    let routeY = side === 'top' ? topBase : bottomBase;

    while (occupied.some((route) => (
      route.minX < maxX &&
      route.maxX > minX &&
      Math.abs(route.routeY - routeY) < DETOUR_LANE_GAP
    ))) {
      routeY += side === 'top' ? -DETOUR_LANE_GAP : DETOUR_LANE_GAP;
    }

    occupied.push({ minX, maxX, routeY });
    detourRoutes.set(choice.id, { routeY });
  }

  return connections.map(({ node, choice }) => {
    const sourcePosition = positions.get(node.id);
    const targetPosition = positions.get(choice.targetNodeId);
    const layerKey = `${sourcePosition?.x ?? 0}:${targetPosition?.x ?? 0}`;
    const sourceIds = sourcesByLayer.get(layerKey) ?? [node.id];
    const sourceIndex = Math.max(0, sourceIds.indexOf(node.id));
    const stepPosition = sourceIds.length === 1
      ? 0.5
      : 0.3 + (sourceIndex / (sourceIds.length - 1)) * 0.4;
    const selected = choice.id === selectedChoiceId;
    const detourData = detourRoutes.get(choice.id);

    return {
        id: choice.id,
        source: node.id,
        target: choice.targetNodeId,
        targetHandle: choice.id,
        type: detourData ? 'story-detour' : 'smoothstep',
        ...(
          detourData
            ? { data: detourData }
            : { pathOptions: { borderRadius: 0, stepPosition } }
        ),
        label: isBranchingNode(node) ? choice.text : undefined,
        selected,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: selected ? '#9edc70' : '#667363',
        },
        style: {
          stroke: selected ? '#9edc70' : '#667363',
          strokeWidth: selected ? 2.5 : 1,
        },
        labelStyle: {
          fill: selected ? '#dff6cf' : '#aab3a7',
          fontSize: 11,
          fontWeight: selected ? 650 : 400,
        },
    } satisfies StoryFlowEdge;
  });
}

function LayoutControl({ store }: { store: DraftStore }) {
  const draft = useStore(store, (state) => state.draft);
  const { fitView } = useReactFlow<StoryFlowNode, StoryFlowEdge>();

  function arrangeLayout() {
    if (!draft) return;
    const positions = layoutStoryNodes(draft.nodes, draft.startNodeId);
    store.getState().applyNodePositions(positions);
    window.requestAnimationFrame(() => {
      void fitView({ padding: 0.18, duration: 260 });
    });
  }

  return (
    <ControlButton
      title="整理布局"
      aria-label="整理布局"
      onClick={arrangeLayout}
    >
      <ApartmentOutlined />
    </ControlButton>
  );
}

function UndoControl({ store }: { store: DraftStore }) {
  const canUndo = useStore(store, (state) => state.canUndo);

  return (
    <ControlButton
      title="撤销（⌘/Ctrl+Z）"
      aria-label="撤销"
      disabled={!canUndo}
      onClick={() => store.getState().undoCanvas()}
    >
      <UndoOutlined />
    </ControlButton>
  );
}

export function selectStoryEdge(
  store: DraftStore,
  edge: Pick<StoryFlowEdge, 'id' | 'source'>,
) {
  store.getState().selectChoice(edge.source, edge.id);
}

export function StoryGraph({ store = draftStore }: { store?: DraftStore }) {
  const draft = useStore(store, (state) => state.draft);
  const selectedNodeId = useStore(store, (state) => state.selectedNodeId);
  const selectedChoiceId = useStore(store, (state) => state.selectedChoiceId);
  const positions = useMemo(
    () => new Map((draft?.nodes ?? []).map((node) => [node.id, node.position])),
    [draft?.nodes],
  );
  const targetHandles = useMemo(
    () => createTargetHandles(draft?.nodes ?? [], positions),
    [draft?.nodes, positions],
  );

  useEffect(() => {
    function handleDeleteKey(event: KeyboardEvent) {
      if (
        (event.key !== 'Delete' && event.key !== 'Backspace') ||
        isTextEditingTarget(event.target)
      ) {
        return;
      }

      const state = store.getState();
      const nodeId = state.selectedNodeId;
      if (!state.draft || !nodeId) return;

      event.preventDefault();
      if (state.selectedChoiceId) {
        state.deleteChoice(nodeId, state.selectedChoiceId);
        return;
      }

      const policy = classifyNodeDeletion(state.draft, nodeId);
      if (policy === 'blocked') {
        message.warning('起点或结局节点不可删除');
      } else {
        state.deleteNode(nodeId);
      }
    }

    function handleUndoKey(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== 'z' ||
        (!event.metaKey && !event.ctrlKey) ||
        event.shiftKey ||
        isTextEditingTarget(event.target)
      ) {
        return;
      }
      if (store.getState().undoCanvas()) event.preventDefault();
    }

    document.addEventListener('keydown', handleDeleteKey);
    document.addEventListener('keydown', handleUndoKey);
    return () => {
      document.removeEventListener('keydown', handleDeleteKey);
      document.removeEventListener('keydown', handleUndoKey);
    };
  }, [store]);

  const nodes = useMemo<StoryFlowNode[]>(
    () =>
      (draft?.nodes ?? []).map((node) => ({
        id: node.id,
        type: 'story',
        position: node.position,
        selected: node.id === selectedNodeId && selectedChoiceId === null,
        data: {
          title: node.title,
          isStart: draft?.startNodeId === node.id,
          isEnding: node.type === 'ending',
          hasScript: node.scriptText.trim().length > 0,
          hasVideo: Boolean(node.videoAssetId),
          targetHandles: targetHandles.get(node.id) ?? [{ id: null, top: 50 }],
          onAddBranch: () => store.getState().addBranchNode(node.id),
        },
      })),
    [draft, selectedChoiceId, selectedNodeId, targetHandles],
  );

  const edges = useMemo<StoryFlowEdge[]>(
    () => createStoryEdges(draft?.nodes ?? [], positions, selectedChoiceId),
    [draft?.nodes, positions, selectedChoiceId],
  );

  const selectNode: NodeMouseHandler<StoryFlowNode> = (_event, node) => {
    store.getState().selectNode(node.id);
  };

  const selectEdge: EdgeMouseHandler<StoryFlowEdge> = (_event, edge) => {
    selectStoryEdge(store, edge);
  };

  function connect(connection: Connection) {
    if (!connection.source || !connection.target) return;
    if (!store.getState().connectNodes(connection.source, connection.target)) {
      message.warning('该连接会形成循环，已取消');
    }
  }

  return (
    <div className="story-graph">
      <ReactFlow<StoryFlowNode, StoryFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={null}
        nodesDraggable={false}
        connectionLineType={ConnectionLineType.Step}
        onNodeClick={selectNode}
        onEdgeClick={selectEdge}
        onConnect={connect}
        onPaneClick={() => store.getState().selectNode(null)}
        fitView
        minZoom={0.25}
        maxZoom={1.8}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#343b33" />
        <Controls showInteractive={false}>
          <UndoControl store={store} />
          <LayoutControl store={store} />
        </Controls>
      </ReactFlow>
    </div>
  );
}
