import { describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { MemoryObjectStore } from '../../test-utils/memory-object-store.js';

async function prepareValidProject(app: ReturnType<typeof buildApp>) {
  const created = await app.inject({
    method: 'POST', url: '/api/projects', payload: { title: '全球冰封' },
  });
  const { project, draft } = created.json();
  const asset = {
    id: 'asset-1', fileName: 'episode.mp4',
    objectKey: `projects/${project.id}/assets/asset-1.mp4`,
    url: 'https://media.example.com/episode.mp4', duration: 5, status: 'available',
  };
  const validDraft = {
    ...draft,
    startNodeId: 'ending',
    assets: [asset],
    nodes: [{
      id: 'ending', title: '获救', type: 'ending', scriptText: '内部剧本不能发布',
      videoAssetId: 'asset-1', position: { x: 12, y: 34 }, choices: [],
    }],
  };
  await app.inject({
    method: 'PUT', url: `/api/projects/${project.id}/draft`, payload: validDraft,
  });
  return { project, validDraft };
}

describe('publishing routes', () => {
  it('returns node-addressable validation issues', async () => {
    const app = buildApp({ objectStore: new MemoryObjectStore() });
    const created = await app.inject({
      method: 'POST', url: '/api/projects', payload: { title: '全球冰封' },
    });
    const { project } = created.json();

    const response = await app.inject({
      method: 'POST', url: `/api/projects/${project.id}/validate`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      valid: false,
      issues: [
        expect.objectContaining({ code: 'CHOICE_MISSING' }),
        expect.objectContaining({ code: 'CONTENT_MISSING' }),
      ],
    });
    await app.close();
  });

  it('publishes immutable incrementing manifests without scripts', async () => {
    const store = new MemoryObjectStore();
    const app = buildApp({ objectStore: store });
    const { project } = await prepareValidProject(app);

    const first = await app.inject({
      method: 'POST', url: `/api/projects/${project.id}/publish`,
    });
    const second = await app.inject({
      method: 'POST', url: `/api/projects/${project.id}/publish`,
    });

    expect(first.statusCode).toBe(201);
    expect(first.json().version).toBe('v1');
    expect(second.json().version).toBe('v2');
    const manifest = store.objects
      .get(`projects/${project.id}/releases/v1/manifest.json`)
      ?.toString('utf8');
    expect(manifest).not.toContain('scriptText');
    expect(manifest).not.toContain('position');

    const releases = await app.inject({
      method: 'GET', url: `/api/projects/${project.id}/releases`,
    });
    expect(releases.json().releases.map((item: { version: string }) => item.version))
      .toEqual(['v2', 'v1']);
    await app.close();
  });

  it('serves only the current published manifest to the public player', async () => {
    const store = new MemoryObjectStore();
    const app = buildApp({ objectStore: store });
    const { project } = await prepareValidProject(app);
    await app.inject({ method: 'POST', url: `/api/projects/${project.id}/publish` });
    await app.inject({ method: 'POST', url: `/api/projects/${project.id}/publish` });
    await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/rollback`,
      payload: { version: 'v1' },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/projects/${project.id}/manifest`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projectId: project.id,
      version: 'v1',
      startNodeId: 'ending',
    });
    expect(response.body).not.toContain('scriptText');
    await app.close();
  });

  it('serves an immutable published manifest by version', async () => {
    const store = new MemoryObjectStore();
    const app = buildApp({ objectStore: store });
    const { project } = await prepareValidProject(app);
    await app.inject({ method: 'POST', url: `/api/projects/${project.id}/publish` });
    await app.inject({ method: 'POST', url: `/api/projects/${project.id}/publish` });

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/projects/${project.id}/manifest?version=v1`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ projectId: project.id, version: 'v1' });
    await app.close();
  });

  it('rejects malformed and missing published versions', async () => {
    const app = buildApp({ objectStore: new MemoryObjectStore() });
    const { project } = await prepareValidProject(app);
    await app.inject({ method: 'POST', url: `/api/projects/${project.id}/publish` });

    const malformed = await app.inject({
      method: 'GET',
      url: `/api/public/projects/${project.id}/manifest?version=latest`,
    });
    const missing = await app.inject({
      method: 'GET',
      url: `/api/public/projects/${project.id}/manifest?version=v99`,
    });

    expect(malformed.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('reports an unpublished story to the public player', async () => {
    const app = buildApp({ objectStore: new MemoryObjectStore() });
    const created = await app.inject({
      method: 'POST', url: '/api/projects', payload: { title: '全球冰封' },
    });
    const { project } = created.json();

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/projects/${project.id}/manifest`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: '作品尚未发布' });
    await app.close();
  });

  it('blocks publishing invalid drafts', async () => {
    const app = buildApp({ objectStore: new MemoryObjectStore() });
    const created = await app.inject({
      method: 'POST', url: '/api/projects', payload: { title: '全球冰封' },
    });
    const { project } = created.json();

    const response = await app.inject({
      method: 'POST', url: `/api/projects/${project.id}/publish`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().issues).toHaveLength(2);
    await app.close();
  });

  it('rolls back by changing only the current release pointer', async () => {
    const store = new MemoryObjectStore();
    const app = buildApp({ objectStore: store });
    const { project } = await prepareValidProject(app);
    await app.inject({ method: 'POST', url: `/api/projects/${project.id}/publish` });
    await app.inject({ method: 'POST', url: `/api/projects/${project.id}/publish` });
    const v1Before = store.objects.get(
      `projects/${project.id}/releases/v1/manifest.json`,
    )?.toString('utf8');

    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/rollback`,
      payload: { version: 'v1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe('v1');
    expect(store.objects.get(
      `projects/${project.id}/releases/v1/manifest.json`,
    )?.toString('utf8')).toBe(v1Before);
    await app.close();
  });
});
