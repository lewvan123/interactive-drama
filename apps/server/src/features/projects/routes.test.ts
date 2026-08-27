import { describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { MemoryObjectStore } from '../../test-utils/memory-object-store.js';

describe('project and draft routes', () => {
  it('creates and lists a project with an initial story node', async () => {
    const store = new MemoryObjectStore();
    const app = buildApp({ objectStore: store });

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { title: '全球冰封' },
    });

    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body.project).toMatchObject({ title: '全球冰封' });
    expect(body.draft).toMatchObject({
      id: body.project.id,
      title: '全球冰封',
      startNodeId: expect.any(String),
      assets: [],
    });
    expect(body.draft.nodes).toEqual([
      expect.objectContaining({
        id: body.draft.startNodeId,
        title: '剧情节点 1',
        type: 'normal',
        choices: [],
      }),
    ]);

    const listed = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(listed.json()).toEqual({ projects: [body.project] });

    const loaded = await app.inject({
      method: 'GET',
      url: `/api/projects/${body.project.id}/draft`,
    });
    expect(loaded.json()).toEqual(body.draft);
    await app.close();
  });

  it('rejects an empty project title', async () => {
    const app = buildApp({ objectStore: new MemoryObjectStore() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { title: '   ' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: '请输入作品名称' });
    await app.close();
  });

  it('validates and server-stamps a saved draft', async () => {
    const app = buildApp({ objectStore: new MemoryObjectStore() });
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { title: '全球冰封' },
    });
    const { draft } = created.json();

    const invalid = await app.inject({
      method: 'PUT',
      url: `/api/projects/${draft.id}/draft`,
      payload: { ...draft, title: '' },
    });
    expect(invalid.statusCode).toBe(400);

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/projects/${draft.id}/draft`,
      payload: { ...draft, title: '冰封求生', updatedAt: '2000-01-01T00:00:00.000Z' },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().title).toBe('冰封求生');
    expect(saved.json().updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
    await app.close();
  });

  it('persists a custom branching prompt in the draft', async () => {
    const app = buildApp({ objectStore: new MemoryObjectStore() });
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { title: '全球冰封' },
    });
    const { draft } = created.json();

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/projects/${draft.id}/draft`,
      payload: {
        ...draft,
        nodes: draft.nodes.map((node: Record<string, unknown>) => ({
          ...node,
          choicePrompt: '要不要开门救她',
        })),
      },
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json().nodes[0].choicePrompt).toBe('要不要开门救她');
    await app.close();
  });

  it('returns 404 for an unknown draft', async () => {
    const app = buildApp({ objectStore: new MemoryObjectStore() });

    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/missing/draft',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: '作品不存在' });
    await app.close();
  });
});
