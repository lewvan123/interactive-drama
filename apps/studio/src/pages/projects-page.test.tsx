import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client.js';
import { ProjectsPage } from './projects-page.js';

vi.mock('../api/client.js', () => ({
  api: {
    listProjects: vi.fn(),
    createProject: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/studio']}>
      <Routes>
        <Route path="/studio" element={<ProjectsPage />} />
        <Route path="/studio/projects/:id/edit" element={<div>编辑器页面</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    mockedApi.listProjects.mockReset();
    mockedApi.createProject.mockReset();
  });

  it('shows a useful empty state', async () => {
    mockedApi.listProjects.mockResolvedValue({ projects: [] });

    renderPage();

    expect(await screen.findByText('从第一条剧情线开始')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建互动短剧' })).toBeVisible();
  });

  it('renders existing projects with their last update time', async () => {
    mockedApi.listProjects.mockResolvedValue({
      projects: [{
        id: 'ice-world',
        title: '全球冰封',
        updatedAt: '2026-08-20T08:30:00.000Z',
      }],
    });

    renderPage();

    expect(await screen.findByText('全球冰封')).toBeVisible();
    expect(screen.getByText(/最近编辑/)).toBeVisible();
  });

  it('creates a named project and opens its editor', async () => {
    const user = userEvent.setup();
    mockedApi.listProjects.mockResolvedValue({ projects: [] });
    mockedApi.createProject.mockResolvedValue({
      project: {
        id: 'ice-world',
        title: '全球冰封',
        updatedAt: '2026-08-20T08:30:00.000Z',
      },
      draft: {
        id: 'ice-world', title: '全球冰封', startNodeId: null,
        nodes: [], assets: [], updatedAt: '2026-08-20T08:30:00.000Z',
      },
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '新建互动短剧' }));
    await user.type(screen.getByLabelText('作品名称'), '全球冰封');
    await user.click(screen.getByRole('button', { name: '创建作品' }));

    await waitFor(() => {
      expect(mockedApi.createProject).toHaveBeenCalledWith('全球冰封');
    });
    expect(await screen.findByText('编辑器页面')).toBeVisible();
  });

  it('shows a contextual error when projects cannot load', async () => {
    mockedApi.listProjects.mockRejectedValue(new Error('network down'));

    renderPage();

    expect(await screen.findByText('作品列表加载失败')).toBeVisible();
    expect(screen.getByRole('button', { name: '重新加载' })).toBeVisible();
  });
});
