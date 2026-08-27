import type { ProjectDraft } from '@interactive-drama/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDraftStore, type DraftApi } from './draft-store.js';

const emptyDraft: ProjectDraft = {
  id: 'demo',
  title: '全球冰封',
  startNodeId: null,
  nodes: [],
  assets: [],
  updatedAt: '2026-08-20T00:00:00.000Z',
};

function createApi(): DraftApi {
  return {
    getDraft: vi.fn().mockResolvedValue(structuredClone(emptyDraft)),
    saveDraft: vi.fn().mockImplementation(async (draft: ProjectDraft) => draft),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('draft store', () => {
  it('loads a draft and makes the first added node the start', async () => {
    const store = createDraftStore(createApi(), 800);
    await store.getState().loadDraft('demo');

    const nodeId = store.getState().addNode({ x: 120, y: 80 });

    expect(store.getState().draft).toMatchObject({
      startNodeId: nodeId,
      nodes: [{ id: nodeId, title: '剧情节点 1', position: { x: 120, y: 80 } }],
    });
    expect(store.getState().selectedNodeId).toBe(nodeId);
  });

  it('deleting a node removes inbound choices and clears the start', async () => {
    const apiClient = createApi();
    vi.mocked(apiClient.getDraft).mockResolvedValue({
      ...emptyDraft,
      startNodeId: 'start',
      nodes: [
        { id: 'start', title: '开始', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [{ id: 'to-end', text: '继续', targetNodeId: 'end', order: 0 }] },
        { id: 'end', title: '结局', type: 'ending', scriptText: '', videoAssetId: null, position: { x: 0, y: 100 }, choices: [] },
      ],
    });
    const store = createDraftStore(apiClient, 800);
    await store.getState().loadDraft('demo');

    store.getState().deleteNode('end');
    expect(store.getState().draft?.nodes[0]?.choices).toEqual([]);
    store.getState().deleteNode('start');
    expect(store.getState().draft?.startNodeId).toBeNull();
  });

  it('accepts converging branches and rejects a cycle', async () => {
    const apiClient = createApi();
    vi.mocked(apiClient.getDraft).mockResolvedValue({
      ...emptyDraft,
      startNodeId: 'start',
      nodes: [
        { id: 'start', title: '开始', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [{ id: 'to-left', text: '左边', targetNodeId: 'left', order: 0 }] },
        { id: 'left', title: '左线', type: 'normal', scriptText: '', videoAssetId: null, position: { x: -100, y: 100 }, choices: [{ id: 'to-end', text: '汇合', targetNodeId: 'end', order: 0 }] },
        { id: 'right', title: '右线', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 100, y: 100 }, choices: [] },
        { id: 'end', title: '结局', type: 'ending', scriptText: '', videoAssetId: null, position: { x: 0, y: 200 }, choices: [] },
      ],
    });
    const store = createDraftStore(apiClient, 800);
    await store.getState().loadDraft('demo');

    expect(store.getState().connectNodes('right', 'end')).toBe(true);
    expect(store.getState().connectNodes('end', 'start')).toBe(false);
    expect(store.getState().draft?.nodes.find((node) => node.id === 'end')?.choices).toEqual([]);
  });

  it('creates a connected branch in the next aligned story layer', async () => {
    const store = createDraftStore(createApi(), 800);
    await store.getState().loadDraft('demo');
    const sourceId = store.getState().addNode({ x: 120, y: 80 });

    const branchId = store.getState().addBranchNode(sourceId);
    const nodes = store.getState().draft?.nodes ?? [];
    const source = nodes.find((node) => node.id === sourceId);
    const branch = nodes.find((node) => node.id === branchId);

    expect(source?.choices).toEqual([
      expect.objectContaining({ text: '分支 1', targetNodeId: branchId, order: 0 }),
    ]);
    expect(branch).toMatchObject({
      title: '剧情节点 2',
      position: { x: 440, y: 80 },
    });
    expect(store.getState().selectedNodeId).toBe(branchId);
  });

  it('inserts a new sibling branch into an occupied row and shifts lower rows down', async () => {
    const apiClient = createApi();
    vi.mocked(apiClient.getDraft).mockResolvedValue({
      ...emptyDraft,
      startNodeId: 'source',
      nodes: [
        {
          id: 'source',
          title: '剧情节点 5',
          type: 'normal',
          scriptText: '',
          videoAssetId: null,
          position: { x: 0, y: 0 },
          choices: [{ id: 'to-sibling', text: '分支 1', targetNodeId: 'sibling', order: 0 }],
        },
        {
          id: 'sibling',
          title: '剧情节点 7',
          type: 'normal',
          scriptText: '',
          videoAssetId: null,
          position: { x: 320, y: 0 },
          choices: [],
        },
        {
          id: 'lower-source',
          title: '剧情节点 4',
          type: 'normal',
          scriptText: '',
          videoAssetId: null,
          position: { x: 0, y: 160 },
          choices: [],
        },
        {
          id: 'occupied',
          title: '剧情节点 8',
          type: 'normal',
          scriptText: '',
          videoAssetId: null,
          position: { x: 320, y: 160 },
          choices: [],
        },
        {
          id: 'below',
          title: '更下方节点',
          type: 'normal',
          scriptText: '',
          videoAssetId: null,
          position: { x: 640, y: 320 },
          choices: [],
        },
      ],
    });
    const store = createDraftStore(apiClient, 800);
    await store.getState().loadDraft('demo');

    const branchId = store.getState().addBranchNode('source');
    const positions = new Map(
      store.getState().draft?.nodes.map((node) => [node.id, node.position]),
    );

    expect(positions.get(branchId!)).toEqual({ x: 320, y: 160 });
    expect(positions.get('source')).toEqual({ x: 0, y: 0 });
    expect(positions.get('sibling')).toEqual({ x: 320, y: 0 });
    expect(positions.get('lower-source')).toEqual({ x: 0, y: 320 });
    expect(positions.get('occupied')).toEqual({ x: 320, y: 320 });
    expect(positions.get('below')).toEqual({ x: 640, y: 480 });
  });

  it('selects a branch and its source node as one editor selection', async () => {
    const store = createDraftStore(createApi(), 800);
    await store.getState().loadDraft('demo');

    store.getState().selectChoice('source', 'choice-a');

    expect(store.getState().selectedNodeId).toBe('source');
    expect(store.getState().selectedChoiceId).toBe('choice-a');

    store.getState().selectNode('another-node');
    expect(store.getState().selectedChoiceId).toBeNull();
  });

  it('deletes only the selected branch and clears its editor selection', async () => {
    const apiClient = createApi();
    vi.mocked(apiClient.getDraft).mockResolvedValue({
      ...emptyDraft,
      startNodeId: 'start',
      nodes: [
        { id: 'start', title: '开始', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [{ id: 'to-end', text: '继续', targetNodeId: 'end', order: 0 }] },
        { id: 'end', title: '结局', type: 'ending', scriptText: '', videoAssetId: null, position: { x: 320, y: 0 }, choices: [] },
      ],
    });
    const store = createDraftStore(apiClient, 800);
    await store.getState().loadDraft('demo');
    store.getState().selectChoice('start', 'to-end');

    store.getState().deleteChoice('start', 'to-end');

    expect(store.getState().draft?.nodes.map((node) => node.id)).toEqual(['start', 'end']);
    expect(store.getState().draft?.nodes[0]?.choices).toEqual([]);
    expect(store.getState().selectedNodeId).toBeNull();
    expect(store.getState().selectedChoiceId).toBeNull();
  });

  it('undoes multiple canvas structure changes in reverse order', async () => {
    const store = createDraftStore(createApi(), 800);
    await store.getState().loadDraft('demo');
    const sourceId = store.getState().addNode({ x: 120, y: 80 });
    store.getState().addBranchNode(sourceId);

    expect(store.getState().canUndo).toBe(true);
    expect(store.getState().draft?.nodes).toHaveLength(2);

    expect(store.getState().undoCanvas()).toBe(true);
    expect(store.getState().draft).toMatchObject({
      startNodeId: sourceId,
      nodes: [{ id: sourceId, choices: [] }],
    });

    expect(store.getState().undoCanvas()).toBe(true);
    expect(store.getState().draft).toMatchObject({ startNodeId: null, nodes: [] });
    expect(store.getState().canUndo).toBe(false);
  });

  it('does not put node content edits into canvas undo history', async () => {
    const store = createDraftStore(createApi(), 800);
    await store.getState().loadDraft('demo');
    const nodeId = 'content-node';
    store.setState({
      draft: {
        ...emptyDraft,
        startNodeId: nodeId,
        nodes: [{
          id: nodeId,
          title: '旧标题',
          type: 'normal',
          scriptText: '',
          videoAssetId: null,
          position: { x: 0, y: 0 },
          choices: [],
        }],
      },
    });
    store.getState().updateNode(nodeId, { title: '新标题', scriptText: '新剧本' });

    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().undoCanvas()).toBe(false);
    expect(store.getState().draft?.nodes[0]).toMatchObject({
      title: '新标题',
      scriptText: '新剧本',
    });
  });

  it('applies an arranged layout to all node positions in one update', async () => {
    const apiClient = createApi();
    vi.mocked(apiClient.getDraft).mockResolvedValue({
      ...emptyDraft,
      nodes: [
        { id: 'start', title: '开始', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 47, y: 83 }, choices: [] },
        { id: 'next', title: '后续', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 615, y: 402 }, choices: [] },
      ],
    });
    const store = createDraftStore(apiClient, 800);
    await store.getState().loadDraft('demo');

    store.getState().applyNodePositions(new Map([
      ['start', { x: 0, y: 0 }],
      ['next', { x: 320, y: 160 }],
    ]));

    expect(store.getState().draft?.nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 320, y: 160 },
    ]);
  });

  it('coalesces changes into one save after 800ms', async () => {
    vi.useFakeTimers();
    const apiClient = createApi();
    const store = createDraftStore(apiClient, 800);
    await store.getState().loadDraft('demo');

    const nodeId = store.getState().addNode({ x: 0, y: 0 });
    store.getState().updateNode(nodeId, { title: '新的标题' });
    expect(store.getState().saveStatus).toBe('saving');
    await vi.advanceTimersByTimeAsync(799);
    expect(apiClient.saveDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(apiClient.saveDraft).toHaveBeenCalledTimes(1);
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('exposes save errors and supports manual retry', async () => {
    const apiClient = createApi();
    vi.mocked(apiClient.saveDraft)
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (draft) => draft);
    const store = createDraftStore(apiClient, 800);
    await store.getState().loadDraft('demo');
    store.getState().addNode({ x: 0, y: 0 });

    await store.getState().saveNow();
    expect(store.getState().saveStatus).toBe('error');
    await store.getState().saveNow();
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('adds uploaded assets once and removes unbound assets', async () => {
    const store = createDraftStore(createApi(), 800);
    await store.getState().loadDraft('demo');
    const asset = {
      id: 'video-1',
      fileName: '暴雪.mp4',
      objectKey: 'assets/video-1.mp4',
      url: '/media/video-1.mp4',
      duration: 12,
      status: 'available' as const,
    };

    store.getState().addAsset(asset);
    store.getState().addAsset(asset);
    expect(store.getState().draft?.assets).toEqual([asset]);

    store.getState().removeAsset(asset.id);
    expect(store.getState().draft?.assets).toEqual([]);
  });
});
