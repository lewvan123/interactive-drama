import type { PublishedManifest } from '@interactive-drama/domain';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client.js';
import { PlayerPage } from './player-page.js';

vi.mock('../api/client.js', () => ({
  api: { getPublishedManifest: vi.fn(), listProjects: vi.fn() },
}));

const getPublishedManifest = vi.mocked(api.getPublishedManifest);
const listProjects = vi.mocked(api.listProjects);
const manifest: PublishedManifest = {
  projectId: 'ice-world',
  title: '全球冰封',
  version: 'v1',
  startNodeId: 'ending',
  nodes: [{
    id: 'ending',
    title: '冰封结局',
    type: 'ending',
    videoUrl: '/ending.mp4',
    choices: [],
  }],
};

function renderPage(path = '/play/ice-world') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/play/:projectId" element={<PlayerPage />} />
        <Route path="/play" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlayerPage', () => {
  beforeEach(() => {
    getPublishedManifest.mockReset();
    listProjects.mockReset();
  });

  it('shows loading feedback and then opens the published story', async () => {
    let resolveManifest!: (value: PublishedManifest) => void;
    getPublishedManifest.mockReturnValue(new Promise((resolve) => {
      resolveManifest = resolve;
    }));
    renderPage();

    expect(screen.getByText('正在加载剧情…')).toBeInTheDocument();
    resolveManifest(manifest);

    expect(await screen.findByRole('heading', { name: '全球冰封' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始体验' })).toBeInTheDocument();
    expect(getPublishedManifest).toHaveBeenCalledWith('ice-world', undefined);
  });

  it('loads the immutable version requested by the playback link', async () => {
    getPublishedManifest.mockResolvedValueOnce({ ...manifest, version: 'v2' });

    renderPage('/play/ice-world?version=v2');

    expect(await screen.findByRole('heading', { name: '全球冰封' })).toBeInTheDocument();
    expect(getPublishedManifest).toHaveBeenCalledWith('ice-world', 'v2');
  });

  it('shows the unpublished message for a missing release', async () => {
    getPublishedManifest.mockRejectedValueOnce(
      Object.assign(new Error('作品尚未发布'), { status: 404 }),
    );
    renderPage();

    expect(await screen.findByText('作品尚未发布')).toBeInTheDocument();
  });

  it('retries a temporary loading failure', async () => {
    const user = userEvent.setup();
    getPublishedManifest
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(manifest);
    renderPage();

    expect(await screen.findByText('暂时无法加载，请稍后重试')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新加载' }));

    expect(await screen.findByRole('heading', { name: '全球冰封' })).toBeInTheDocument();
    await waitFor(() => expect(getPublishedManifest).toHaveBeenCalledTimes(2));
  });

  it('opens the most recently updated published story from the generic play link', async () => {
    listProjects.mockResolvedValueOnce({
      projects: [
        { id: 'new-draft', title: '未发布新作', updatedAt: '2026-08-21T12:00:00.000Z' },
        { id: 'ice-world', title: '全球冰封', updatedAt: '2026-08-20T12:00:00.000Z' },
      ],
    });
    getPublishedManifest
      .mockRejectedValueOnce(Object.assign(new Error('作品尚未发布'), { status: 404 }))
      .mockResolvedValueOnce(manifest);

    renderPage('/play');

    expect(await screen.findByRole('heading', { name: '全球冰封' })).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledTimes(1);
    expect(getPublishedManifest).toHaveBeenNthCalledWith(1, 'new-draft');
    expect(getPublishedManifest).toHaveBeenNthCalledWith(2, 'ice-world');
  });
});
