import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API client', () => {
  it('does not send a JSON content type for a bodyless validation request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ valid: true, issues: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.validateProject('demo');

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/demo/validate', {
      method: 'POST',
      headers: {},
    });
  });

  it('loads the current published manifest for the public player', async () => {
    const manifest = {
      projectId: 'ice-world',
      title: '全球冰封',
      version: 'v1',
      startNodeId: 'start',
      nodes: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.getPublishedManifest('ice-world')).resolves.toEqual(manifest);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/projects/ice-world/manifest',
      { headers: {} },
    );
  });

  it('loads a fixed published version for the public player', async () => {
    const manifest = {
      projectId: 'ice world',
      title: '全球冰封',
      version: 'v2',
      startNodeId: 'start',
      nodes: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.getPublishedManifest('ice world', 'v2')).resolves.toEqual(manifest);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/projects/ice%20world/manifest?version=v2',
      { headers: {} },
    );
  });
});
