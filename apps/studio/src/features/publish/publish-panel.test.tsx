import type { ProjectDraft, ValidationIssue } from '@interactive-drama/domain';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createDraftStore } from '../../stores/draft-store.js';
import { PublishPanel, type PublishingApi } from './publish-panel.js';

const draft: ProjectDraft = {
  id: 'demo', title: '全球冰封', startNodeId: 'start', assets: [],
  updatedAt: '2026-08-20T00:00:00.000Z',
  nodes: [
    { id: 'start', title: '暴雪来临', type: 'normal', scriptText: '', videoAssetId: null, position: { x: 0, y: 0 }, choices: [] },
  ],
};

function createLoadedStore() {
  const store = createDraftStore({
    getDraft: vi.fn().mockResolvedValue(draft),
    saveDraft: vi.fn().mockImplementation(async (value) => value),
  });
  store.setState({ draft, loadStatus: 'ready', saveStatus: 'saved' });
  return store;
}

function createClient(overrides: Partial<PublishingApi> = {}): PublishingApi {
  return {
    validateProject: vi.fn().mockResolvedValue({ valid: true, issues: [] }),
    publishProject: vi.fn().mockResolvedValue({ version: 'v1', publishedAt: '2026-08-20T08:00:00.000Z', manifestUrl: '/v1.json' }),
    listReleases: vi.fn().mockResolvedValue({ releases: [] }),
    getCurrentRelease: vi.fn().mockResolvedValue(null),
    rollbackProject: vi.fn(),
    ...overrides,
  };
}

describe('PublishPanel', () => {
  it('disables publishing when validation fails and locates the broken node', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore();
    const issue: ValidationIssue = {
      code: 'VIDEO_MISSING',
      nodeId: 'start',
      message: '节点“暴雪来临”尚未绑定视频',
    };
    const client = createClient({
      validateProject: vi.fn().mockResolvedValue({ valid: false, issues: [issue] }),
    });
    const onLocateNode = vi.fn();
    render(<PublishPanel store={store} client={client} onLocateNode={onLocateNode} />);

    expect(await screen.findByText(issue.message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布新版本' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '定位节点' }));
    expect(store.getState().selectedNodeId).toBe('start');
    expect(onLocateNode).toHaveBeenCalledWith('start');
  });

  it('publishes after confirmation and refreshes the release list', async () => {
    const user = userEvent.setup();
    const releases = vi.fn()
      .mockResolvedValueOnce({ releases: [] })
      .mockResolvedValue({
        releases: [{ version: 'v1', publishedAt: '2026-08-20T08:00:00.000Z', manifestUrl: '/v1.json' }],
      });
    const client = createClient({ listReleases: releases });
    render(<PublishPanel store={createLoadedStore()} client={client} />);

    await waitFor(() => expect(screen.getByRole('button', { name: '发布新版本' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '发布新版本' }));
    expect(await screen.findByText('确认发布新版本？')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认发布' }));

    await waitFor(() => expect(client.publishProject).toHaveBeenCalledWith('demo'));
    expect(await screen.findByText('v1')).toBeInTheDocument();
    expect(releases).toHaveBeenCalledTimes(2);
  });

  it('rolls back to a historical release after confirmation', async () => {
    const user = userEvent.setup();
    const release = { version: 'v1', publishedAt: '2026-08-20T08:00:00.000Z', manifestUrl: '/v1.json' };
    const client = createClient({
      listReleases: vi.fn().mockResolvedValue({ releases: [release] }),
      getCurrentRelease: vi.fn().mockResolvedValue({ ...release, version: 'v2' }),
      rollbackProject: vi.fn().mockResolvedValue(release),
    });
    render(<PublishPanel store={createLoadedStore()} client={client} />);

    await user.click(await screen.findByRole('button', { name: '回滚到 v1' }));
    expect(await screen.findByText('回滚到 v1？')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认回滚' }));

    await waitFor(() => expect(client.rollbackProject).toHaveBeenCalledWith('demo', 'v1'));
  });

  it('provides an immutable H5 link for every release', async () => {
    const v1 = { version: 'v1', publishedAt: '2026-08-20T08:00:00.000Z', manifestUrl: '/v1.json' };
    const v2 = { version: 'v2', publishedAt: '2026-08-21T08:00:00.000Z', manifestUrl: '/v2.json' };
    const client = createClient({
      listReleases: vi.fn().mockResolvedValue({ releases: [v2, v1] }),
      getCurrentRelease: vi.fn().mockResolvedValue(v2),
    });

    render(<PublishPanel store={createLoadedStore()} client={client} />);

    const v1Link = await screen.findByRole('link', { name: '播放 v1 H5' });
    const v2Link = screen.getByRole('link', { name: '播放 v2 H5' });
    expect(v1Link).toHaveAttribute('href', '/play/demo?version=v1');
    expect(v2Link).toHaveAttribute('href', '/play/demo?version=v2');
    expect(v1Link).toHaveAttribute('target', '_blank');
    expect(v1Link).toHaveAttribute('rel', 'noreferrer');
    expect(v2Link).toHaveAttribute('target', '_blank');
    expect(v2Link).toHaveAttribute('rel', 'noreferrer');
  });
});
