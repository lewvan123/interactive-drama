import type { ProjectDraft } from '@interactive-drama/domain';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDraftStore } from '../../stores/draft-store.js';
import {
  classifyNodeDeletion,
  createStoryEdges,
  selectStoryEdge,
  StoryGraph,
} from './story-graph.js';

const draft: ProjectDraft = {
  id: 'demo', title: '全球冰封', startNodeId: 'start', assets: [{
    id: 'video', fileName: 'ending.mp4', objectKey: 'ending.mp4',
    url: '/media/ending.mp4', duration: 5, status: 'available',
  }], updatedAt: '2026-08-20T00:00:00.000Z',
  nodes: [
    { id: 'start', title: '暴雪来临', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [{ id: 'next', text: '继续', targetNodeId: 'end', order: 0 }] },
    { id: 'end', title: '成功获救', type: 'ending', scriptText: '救援队抵达。', videoAssetId: 'video', position: { x: 220, y: 140 }, choices: [] },
  ],
};

function createLoadedStore(initialDraft = draft) {
  const api = {
    getDraft: vi.fn().mockResolvedValue(initialDraft),
    saveDraft: vi.fn().mockImplementation(async (value) => value),
  };
  const store = createDraftStore(api, 800);
  store.setState({ draft: structuredClone(initialDraft), loadStatus: 'ready', saveStatus: 'saved' });
  return store;
}

function expectNodePosition(
  container: HTMLElement,
  nodeId: string,
  x: number,
  y: number,
) {
  const element = container.querySelector<HTMLElement>(
    `.react-flow__node[data-id="${nodeId}"]`,
  );
  expect(element).toBeInTheDocument();
  expect(element?.style.transform.replaceAll(' ', ''))
    .toBe(`translate(${x}px,${y}px)`);
}

describe('StoryGraph', () => {
  it('shows start, script and video readiness on node cards', () => {
    render(<StoryGraph store={createLoadedStore()} />);

    expect(screen.getByText('暴雪来临')).toBeInTheDocument();
    expect(screen.getByText('起点')).toBeInTheDocument();
    expect(screen.getByText('缺少剧本')).toBeInTheDocument();
    expect(screen.getByText('缺少视频')).toBeInTheDocument();
    expect(screen.getByText('已有剧本')).toBeInTheDocument();
    expect(screen.getByText('已绑定视频')).toBeInTheDocument();
  });

  it('uses left input handles and right output handles', () => {
    const { container } = render(<StoryGraph store={createLoadedStore()} />);

    expect(container.querySelectorAll('.react-flow__handle-left')).toHaveLength(2);
    expect(container.querySelectorAll('.react-flow__handle-right')).toHaveLength(1);
    expect(container.querySelector('.react-flow__handle-top')).not.toBeInTheDocument();
    expect(container.querySelector('.react-flow__handle-bottom')).not.toBeInTheDocument();
  });

  it('draws branch connections as orthogonal lines', () => {
    const [edge] = createStoryEdges(draft.nodes);

    expect(edge).toMatchObject({
      type: 'smoothstep',
      pathOptions: { borderRadius: 0 },
    });
  });

  it('renders a single downstream connection as an unlabeled story line', () => {
    const [edge] = createStoryEdges(draft.nodes);

    expect(edge?.label).toBeUndefined();
  });

  it('keeps labels when a node has multiple downstream branches', () => {
    const nodes: ProjectDraft['nodes'] = [
      {
        ...draft.nodes[0]!,
        choices: [
          { id: 'stay', text: '留在原地', targetNodeId: 'end', order: 0 },
          { id: 'leave', text: '离开这里', targetNodeId: 'other-end', order: 1 },
        ],
      },
      draft.nodes[1]!,
      { ...draft.nodes[1]!, id: 'other-end', title: '另一结局' },
    ];

    expect(createStoryEdges(nodes).map((edge) => edge.label))
      .toEqual(['留在原地', '离开这里']);
  });

  it('uses separate routing lanes for different parents in the same layer', () => {
    const nodes: ProjectDraft['nodes'] = [
      { id: 'upper-parent', title: '上方父节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 320, y: 0 }, choices: [{ id: 'upper-shared', text: '汇合', targetNodeId: 'shared', order: 0 }] },
      { id: 'lower-parent', title: '下方父节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 320, y: 320 }, choices: [
        { id: 'lower-first', text: '分支 1', targetNodeId: 'first', order: 0 },
        { id: 'lower-shared', text: '分支 2', targetNodeId: 'shared', order: 1 },
        { id: 'lower-last', text: '分支 3', targetNodeId: 'last', order: 2 },
      ] },
      { id: 'first', title: '分支一', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 640, y: 160 }, choices: [] },
      { id: 'shared', title: '汇合节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 640, y: 320 }, choices: [] },
      { id: 'last', title: '分支三', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 640, y: 480 }, choices: [] },
    ];
    const positions = new Map(nodes.map((node) => [node.id, node.position]));
    const edges = createStoryEdges(nodes, positions);
    const laneOf = (edgeId: string) => (
      edges.find((edge) => edge.id === edgeId) as {
        pathOptions?: { stepPosition?: number };
      } | undefined
    )?.pathOptions?.stepPosition;

    expect(new Set([
      laneOf('lower-first'),
      laneOf('lower-shared'),
      laneOf('lower-last'),
    ])).toEqual(new Set([laneOf('lower-first')]));
    expect(laneOf('upper-shared')).not.toBe(laneOf('lower-first'));
  });

  it('routes a skip-layer connection outside the intermediate node rows', () => {
    const nodes: ProjectDraft['nodes'] = [
      {
        id: 'node-3', title: '节点 3', type: 'normal', scriptText: '', videoAssetId: null,
        position: { x: 320, y: 160 },
        choices: [
          { id: 'to-node-5', text: '前往节点 5', targetNodeId: 'node-5', order: 0 },
          { id: 'to-node-6', text: '直接前往节点 6', targetNodeId: 'node-6', order: 1 },
        ],
      },
      { id: 'node-4', title: '节点 4', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 640, y: 0 }, choices: [{ id: 'node-4-to-6', text: '汇合', targetNodeId: 'node-6', order: 0 }] },
      { id: 'node-5', title: '节点 5', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 640, y: 160 }, choices: [{ id: 'node-5-to-6', text: '汇合', targetNodeId: 'node-6', order: 0 }] },
      { id: 'node-6', title: '节点 6', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 960, y: 80 }, choices: [] },
    ];

    const edges = createStoryEdges(nodes);
    const adjacentEdge = edges.find((edge) => edge.id === 'to-node-5');
    const skipLayerEdge = edges.find((edge) => edge.id === 'to-node-6');
    const routeY = (skipLayerEdge?.data as { routeY?: number } | undefined)?.routeY;

    expect(adjacentEdge?.type).toBe('smoothstep');
    expect(skipLayerEdge?.type).toBe('story-detour');
    expect(routeY).toBeGreaterThan(260);
  });

  it('gives overlapping skip-layer connections separate detour lanes', () => {
    const nodes: ProjectDraft['nodes'] = [
      {
        id: 'source', title: '分支起点', type: 'normal', scriptText: '', videoAssetId: null,
        position: { x: 320, y: 160 },
        choices: [
          { id: 'skip-upper', text: '直达上方', targetNodeId: 'upper-target', order: 0 },
          { id: 'skip-lower', text: '直达下方', targetNodeId: 'lower-target', order: 1 },
        ],
      },
      { id: 'middle-upper', title: '中间上方', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 640, y: 0 }, choices: [] },
      { id: 'middle-lower', title: '中间下方', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 640, y: 160 }, choices: [] },
      { id: 'upper-target', title: '上方目标', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 960, y: 0 }, choices: [] },
      { id: 'lower-target', title: '下方目标', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 960, y: 160 }, choices: [] },
    ];

    const detourRouteYs = createStoryEdges(nodes)
      .filter((edge) => edge.type === 'story-detour')
      .map((edge) => (edge.data as { routeY: number }).routeY);

    expect(detourRouteYs).toHaveLength(2);
    expect(new Set(detourRouteYs)).toHaveLength(2);
  });

  it('routes converging branches into separate input handles on the shared node', () => {
    const mergingDraft: ProjectDraft = {
      ...draft,
      nodes: [
        {
          ...draft.nodes[0]!,
          choices: [
            { id: 'to-upper', text: '上方路线', targetNodeId: 'upper', order: 0 },
            { id: 'to-lower', text: '下方路线', targetNodeId: 'lower', order: 1 },
          ],
        },
        { id: 'upper', title: '上方父节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [{ id: 'upper-merge', text: '汇合', targetNodeId: 'merge', order: 0 }] },
        { id: 'lower', title: '下方父节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [{ id: 'lower-merge', text: '汇合', targetNodeId: 'merge', order: 0 }] },
        { id: 'merge', title: '汇合节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [] },
      ],
    };

    const { container } = render(<StoryGraph store={createLoadedStore(mergingDraft)} />);
    const handles = container.querySelectorAll(
      '.react-flow__node[data-id="merge"] .react-flow__handle-left',
    );
    const edges = createStoryEdges(mergingDraft.nodes);

    expect(handles).toHaveLength(2);
    expect([...handles].map((handle) => handle.getAttribute('data-handleid')).sort())
      .toEqual(['lower-merge', 'upper-merge']);
    expect([...handles].map((handle) => handle.getAttribute('style'))[0])
      .not.toBe([...handles].map((handle) => handle.getAttribute('style'))[1]);
    expect(edges.find((edge) => edge.id === 'upper-merge')?.targetHandle)
      .toBe('upper-merge');
    expect(edges.find((edge) => edge.id === 'lower-merge')?.targetHandle)
      .toBe('lower-merge');
  });

  it('arranges branches in fixed horizontal layers and centers their parent on demand', () => {
    const branchingDraft: ProjectDraft = {
      ...draft,
      nodes: [
        {
          ...draft.nodes[0]!,
          position: { x: 47, y: 83 },
          choices: [
            { id: 'to-upper', text: '上方分支', targetNodeId: 'upper', order: 0 },
            { id: 'to-lower', text: '下方分支', targetNodeId: 'lower', order: 1 },
          ],
        },
        { id: 'upper', title: '上方节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 615, y: 402 }, choices: [] },
        { id: 'lower', title: '下方节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 185, y: 911 }, choices: [] },
      ],
    };

    const { container } = render(<StoryGraph store={createLoadedStore(branchingDraft)} />);

    fireEvent.click(screen.getByRole('button', { name: '整理布局' }));

    expectNodePosition(container, 'start', 0, 80);
    expectNodePosition(container, 'upper', 320, 0);
    expectNodePosition(container, 'lower', 320, 160);
  });

  it('places a shared downstream node once after its deepest upstream layer', () => {
    const mergingDraft: ProjectDraft = {
      ...draft,
      nodes: [
        {
          ...draft.nodes[0]!,
          choices: [
            { id: 'to-fast', text: '快速路线', targetNodeId: 'fast', order: 0 },
            { id: 'to-slow', text: '慢速路线', targetNodeId: 'slow', order: 1 },
          ],
        },
        { id: 'fast', title: '快速路线', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [{ id: 'fast-merge', text: '汇合', targetNodeId: 'merge', order: 0 }] },
        { id: 'slow', title: '慢速路线', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [{ id: 'to-middle', text: '继续', targetNodeId: 'middle', order: 0 }] },
        { id: 'middle', title: '中间节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [{ id: 'middle-merge', text: '汇合', targetNodeId: 'merge', order: 0 }] },
        { id: 'merge', title: '汇合节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [] },
      ],
    };

    const { container } = render(<StoryGraph store={createLoadedStore(mergingDraft)} />);

    fireEvent.click(screen.getByRole('button', { name: '整理布局' }));

    expectNodePosition(container, 'fast', 320, 0);
    expectNodePosition(container, 'slow', 320, 160);
    expectNodePosition(container, 'middle', 640, 160);
    expectNodePosition(container, 'merge', 960, 0);
    expect(container.querySelectorAll('.react-flow__node[data-id="merge"]')).toHaveLength(1);
  });

  it('places isolated nodes below the main story graph', () => {
    const isolatedDraft: ProjectDraft = {
      ...draft,
      nodes: [
        draft.nodes[0]!,
        draft.nodes[1]!,
        { id: 'isolated', title: '孤立节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 999, y: 27 }, choices: [] },
      ],
    };

    const { container } = render(<StoryGraph store={createLoadedStore(isolatedDraft)} />);

    fireEvent.click(screen.getByRole('button', { name: '整理布局' }));

    expectNodePosition(container, 'start', 0, 0);
    expectNodePosition(container, 'end', 320, 0);
    expectNodePosition(container, 'isolated', 0, 320);
  });

  it('keeps a detached downstream story arranged as a separate horizontal graph', () => {
    const detachedDraft: ProjectDraft = {
      ...draft,
      nodes: [
        draft.nodes[0]!,
        draft.nodes[1]!,
        { id: 'detached-root', title: '脱离节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 29, y: 777 }, choices: [{ id: 'detached-next', text: '继续', targetNodeId: 'detached-child', order: 0 }] },
        { id: 'detached-child', title: '脱离下游', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 41, y: 912 }, choices: [] },
      ],
    };

    const { container } = render(<StoryGraph store={createLoadedStore(detachedDraft)} />);

    fireEvent.click(screen.getByRole('button', { name: '整理布局' }));

    expectNodePosition(container, 'detached-root', 0, 320);
    expectNodePosition(container, 'detached-child', 320, 320);
  });

  it('prevents nodes from being freely dragged', () => {
    const { container } = render(<StoryGraph store={createLoadedStore()} />);

    expect(container.querySelectorAll('.react-flow__node.draggable')).toHaveLength(0);
  });

  it('keeps persisted positions until the user requests layout', () => {
    const { container } = render(<StoryGraph store={createLoadedStore()} />);

    expectNodePosition(container, 'start', 0, 0);
    expectNodePosition(container, 'end', 220, 140);
    expect(screen.getByRole('button', { name: '整理布局' })).toBeInTheDocument();
  });

  it('undoes canvas edits from the control and disables it when history is empty', () => {
    const store = createLoadedStore();
    render(<StoryGraph store={store} />);
    const undoButton = screen.getByRole('button', { name: '撤销' });

    expect(undoButton).toBeDisabled();
    act(() => { store.getState().addBranchNode('start'); });
    expect(undoButton).toBeEnabled();

    fireEvent.click(undoButton);
    expect(store.getState().draft?.nodes).toHaveLength(2);
    expect(undoButton).toBeDisabled();
  });

  it('undoes canvas edits with Control+Z outside text fields', () => {
    const store = createLoadedStore();
    render(<StoryGraph store={store} />);
    store.getState().addBranchNode('start');

    fireEvent.keyDown(document, { key: 'z', code: 'KeyZ', ctrlKey: true });

    expect(store.getState().draft?.nodes).toHaveLength(2);
    expect(store.getState().canUndo).toBe(false);
  });

  it('selects a clicked branch connection for editing', () => {
    const store = createLoadedStore();
    selectStoryEdge(store, { id: 'next', source: 'start' });
    const edge = createStoryEdges(
      draft.nodes,
      new Map(draft.nodes.map((node) => [node.id, node.position])),
      store.getState().selectedChoiceId,
    ).find((candidate) => candidate.id === 'next');

    expect(store.getState().selectedNodeId).toBe('start');
    expect(store.getState().selectedChoiceId).toBe('next');
    expect(edge).toMatchObject({
      selected: true,
      style: { stroke: '#9edc70', strokeWidth: 2.5 },
    });
  });

  it('highlights only the selected branch, not its source node', () => {
    const store = createLoadedStore();
    selectStoryEdge(store, { id: 'next', source: 'start' });
    const { container } = render(<StoryGraph store={store} />);

    expect(container.querySelector('.react-flow__node[data-id="start"]'))
      .not.toHaveClass('selected');
    expect(container.querySelector('.react-flow__node[data-id="start"] .story-node-card'))
      .not.toHaveClass('is-selected');
  });

  it('deletes a selected branch directly without deleting either node', () => {
    const store = createLoadedStore();
    selectStoryEdge(store, { id: 'next', source: 'start' });
    render(<StoryGraph store={store} />);

    fireEvent.keyDown(document, { key: 'Delete', code: 'Delete' });

    expect(store.getState().draft?.nodes.map((node) => node.id)).toEqual(['start', 'end']);
    expect(store.getState().draft?.nodes[0]?.choices).toEqual([]);
    expect(screen.queryByText('删除将导致剧情无法连贯，是否继续删除？'))
      .not.toBeInTheDocument();
  });

  it('does not draw an edge before a branch target is selected', () => {
    const nodes = structuredClone(draft.nodes);
    nodes[0]?.choices.push({
      id: 'pending',
      text: '分支 2',
      targetNodeId: '',
      order: 1,
    });

    expect(createStoryEdges(nodes).map((edge) => edge.id)).not.toContain('pending');
  });

  it('removes the standalone graph toolbar action', () => {
    render(<StoryGraph store={createLoadedStore()} />);

    expect(screen.queryByRole('button', { name: '添加剧情节点' })).not.toBeInTheDocument();
  });

  it('shows a branch shortcut only on the selected normal node', () => {
    const store = createLoadedStore();
    store.setState({ selectedNodeId: 'start' });
    const { container } = render(<StoryGraph store={store} />);

    const shortcut = container.querySelector('[aria-label="从暴雪来临添加分支"]');
    expect(shortcut).toHaveClass('react-flow__handle', 'source');
    expect(container.querySelector('[aria-label="从成功获救添加分支"]')).not.toBeInTheDocument();
  });

  it('creates and connects a branch from the selected node shortcut', () => {
    const store = createLoadedStore();
    store.setState({ selectedNodeId: 'start' });
    const { container } = render(<StoryGraph store={store} />);

    const addBranch = container.querySelector('[aria-label="从暴雪来临添加分支"]');
    expect(addBranch).toBeInTheDocument();
    fireEvent.click(addBranch!);

    expect(store.getState().draft?.nodes).toHaveLength(3);
    expect(store.getState().draft?.nodes.find((node) => node.id === 'start')?.choices)
      .toHaveLength(2);
  });

  it.each([
    ['isolated', 'direct'],
    ['leaf', 'direct'],
    ['start', 'blocked'],
    ['ending', 'blocked'],
    ['middle', 'direct'],
  ] as const)('classifies %s node deletion as %s', (nodeId, expected) => {
    const nodes = [
      { id: 'start', title: '起点', type: 'normal' as const, scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [{ id: 'to-leaf', text: '继续', targetNodeId: 'leaf', order: 0 }] },
      { id: 'leaf', title: '叶子', type: 'normal' as const, scriptText: '', videoAssetId: null, position: { x: 200, y: 0 }, choices: [] },
      { id: 'isolated', title: '孤立', type: 'normal' as const, scriptText: '', videoAssetId: null, position: { x: 0, y: 200 }, choices: [] },
      { id: 'middle', title: '中间', type: 'normal' as const, scriptText: '', videoAssetId: null, position: { x: 200, y: 200 }, choices: [{ id: 'to-ending', text: '继续', targetNodeId: 'ending', order: 0 }] },
      { id: 'ending', title: '结局', type: 'ending' as const, scriptText: '', videoAssetId: null, position: { x: 400, y: 200 }, choices: [] },
    ];

    expect(classifyNodeDeletion({ ...draft, startNodeId: 'start', nodes }, nodeId)).toBe(expected);
  });

  it('deletes a selected leaf with the keyboard and removes its inbound branch', async () => {
    const leafDraft: ProjectDraft = {
      ...draft,
      nodes: [
        { ...draft.nodes[0]!, choices: [{ id: 'to-leaf', text: '继续', targetNodeId: 'leaf', order: 0 }] },
        { id: 'leaf', title: '普通叶子', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 220, y: 140 }, choices: [] },
      ],
    };
    const store = createLoadedStore(leafDraft);
    store.setState({ selectedNodeId: 'leaf' });
    render(<StoryGraph store={store} />);

    fireEvent.keyDown(document, { key: 'Delete', code: 'Delete' });

    await waitFor(() => expect(store.getState().draft?.nodes.map((node) => node.id)).toEqual(['start']));
    expect(store.getState().draft?.nodes[0]?.choices).toEqual([]);
  });

  it('deletes a selected middle node directly and allows undo', async () => {
    const middleDraft: ProjectDraft = {
      ...draft,
      nodes: [
        { ...draft.nodes[0]!, choices: [{ id: 'to-middle', text: '继续', targetNodeId: 'middle', order: 0 }] },
        { id: 'middle', title: '中间节点', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 220, y: 0 }, choices: [{ id: 'to-end', text: '继续', targetNodeId: 'end', order: 0 }] },
        draft.nodes[1]!,
      ],
    };
    const store = createLoadedStore(middleDraft);
    store.setState({ selectedNodeId: 'middle' });
    render(<StoryGraph store={store} />);

    fireEvent.keyDown(document, { key: 'Delete', code: 'Delete' });

    expect(store.getState().draft?.nodes.some((node) => node.id === 'middle')).toBe(false);
    expect(screen.queryByText('删除将导致剧情无法连贯，是否继续删除？'))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(store.getState().draft?.nodes.some((node) => node.id === 'middle')).toBe(true);
  });

  it('does not delete the selected node while editing an input', async () => {
    const leafDraft: ProjectDraft = {
      ...draft,
      nodes: [
        draft.nodes[0]!,
        { id: 'leaf', title: '普通叶子', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 220, y: 140 }, choices: [] },
      ],
    };
    const store = createLoadedStore(leafDraft);
    store.setState({ selectedNodeId: 'leaf' });
    render(
      <>
        <input aria-label="正在编辑" defaultValue="内容" />
        <StoryGraph store={store} />
      </>,
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: '正在编辑' }), {
      key: 'Backspace',
      code: 'Backspace',
    });

    expect(store.getState().draft?.nodes.some((node) => node.id === 'leaf')).toBe(true);
  });
});
