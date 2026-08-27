import type { ProjectDraft } from '@interactive-drama/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createDraftStore } from '../../stores/draft-store.js';
import { AssetLibrary, type AssetLibraryApi } from './asset-library.js';

const draft: ProjectDraft = {
  id: 'demo',
  title: '全球冰封',
  startNodeId: 'start',
  updatedAt: '2026-08-20T00:00:00.000Z',
  assets: [
    { id: 'bound', fileName: '开场.mp4', objectKey: 'bound.mp4', url: '/media/bound.mp4', duration: 10, status: 'available' },
    { id: 'free', fileName: '雪夜.mp4', objectKey: 'free.mp4', url: '/media/free.mp4', duration: 8, status: 'available' },
  ],
  nodes: [
    { id: 'start', title: '暴雪来临', type: 'normal', scriptText: '', videoAssetId: 'bound', position: { x: 0, y: 0 }, choices: [] },
  ],
};

function createLoadedStore() {
  const store = createDraftStore({
    getDraft: vi.fn().mockResolvedValue(draft),
    saveDraft: vi.fn().mockImplementation(async (value) => value),
  });
  store.setState({ draft: structuredClone(draft), loadStatus: 'ready', saveStatus: 'saved' });
  return store;
}

function createApi(): AssetLibraryApi {
  return {
    createUploadTarget: vi.fn(),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AssetLibrary', () => {
  it('shows bound node names and protects bound assets from deletion', () => {
    render(<AssetLibrary store={createLoadedStore()} client={createApi()} />);

    expect(screen.getByText('已绑定：暴雪来临')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除 开场.mp4' })).toBeDisabled();
    expect(screen.getByText('请先在对应节点解除绑定')).toBeInTheDocument();
  });

  it('confirms deletion and removes an unbound asset from the draft', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore();
    const client = createApi();
    render(<AssetLibrary store={store} client={client} />);

    await user.click(screen.getByRole('button', { name: '删除 雪夜.mp4' }));
    expect(await screen.findByText('删除视频素材？')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    expect(client.deleteAsset).toHaveBeenCalledWith('demo', 'free');
    expect(store.getState().draft?.assets.map((item) => item.id)).toEqual(['bound']);
  });
});
