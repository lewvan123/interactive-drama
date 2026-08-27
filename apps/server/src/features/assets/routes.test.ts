import { describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { MemoryObjectStore } from '../../test-utils/memory-object-store.js';

async function createProject(app: ReturnType<typeof buildApp>) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: { title: '全球冰封' },
  });
  return response.json();
}

describe('asset routes', () => {
  it('rejects non-MP4 uploads', async () => {
    const app = buildApp({ objectStore: new MemoryObjectStore() });
    const { project } = await createProject(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/assets/upload-target`,
      payload: {
        fileName: 'episode.mov',
        contentType: 'video/quicktime',
        size: 100,
        duration: 5,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: '仅支持MP4视频' });
    await app.close();
  });

  it('returns an OSS signed upload target', async () => {
    const store = new MemoryObjectStore('https://oss.example.com/signed');
    const app = buildApp({ objectStore: store });
    const { project } = await createProject(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/assets/upload-target`,
      payload: {
        fileName: 'episode.mp4',
        contentType: 'video/mp4',
        size: 100,
        duration: 5,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      uploadUrl: 'https://oss.example.com/signed',
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      asset: {
        fileName: 'episode.mp4',
        duration: 5,
        status: 'available',
      },
    });
    await app.close();
  });

  it('accepts a local streamed upload', async () => {
    const store = new MemoryObjectStore();
    const app = buildApp({ objectStore: store });
    const { project } = await createProject(app);
    const targetResponse = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/assets/upload-target`,
      payload: {
        fileName: 'episode.mp4', contentType: 'video/mp4', size: 10, duration: 5,
      },
    });
    const target = targetResponse.json();

    const upload = await app.inject({
      method: 'PUT',
      url: target.uploadUrl,
      headers: { 'content-type': 'video/mp4' },
      payload: Buffer.from('video-data'),
    });

    expect(upload.statusCode).toBe(204);
    expect(store.objects.get(target.asset.objectKey)?.toString()).toBe('video-data');
    await app.close();
  });

  it('refuses to delete a bound asset and deletes it after unbinding', async () => {
    const store = new MemoryObjectStore();
    const app = buildApp({ objectStore: store });
    const { project, draft } = await createProject(app);
    const targetResponse = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/assets/upload-target`,
      payload: {
        fileName: 'episode.mp4', contentType: 'video/mp4', size: 10, duration: 5,
      },
    });
    const { asset } = targetResponse.json();
    const boundDraft = {
      ...draft,
      startNodeId: 'start',
      assets: [asset],
      nodes: [{
        id: 'start', title: '第一集', type: 'ending', scriptText: '',
        videoAssetId: asset.id, position: { x: 0, y: 0 }, choices: [],
      }],
    };
    await app.inject({
      method: 'PUT', url: `/api/projects/${project.id}/draft`, payload: boundDraft,
    });

    const blocked = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/assets/${asset.id}`,
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({
      message: '请先从节点解绑该视频',
      nodeIds: ['start'],
    });

    boundDraft.nodes[0].videoAssetId = null;
    await app.inject({
      method: 'PUT', url: `/api/projects/${project.id}/draft`, payload: boundDraft,
    });
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/assets/${asset.id}`,
    });
    expect(deleted.statusCode).toBe(204);
    expect(store.objects.has(asset.objectKey)).toBe(false);
    await app.close();
  });
});
