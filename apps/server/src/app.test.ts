import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import type { AppConfig } from './config.js';
import { LocalObjectStore } from './storage/local-object-store.js';
import { MemoryObjectStore } from './test-utils/memory-object-store.js';

describe('GET /healthz', () => {
  it('reports health without requiring storage access', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});

describe('GET /media/*', () => {
  it('streams a locally stored asset', async () => {
    const rootDir = join(tmpdir(), `studio-media-${crypto.randomUUID()}`);
    const objectStore = new LocalObjectStore({
      rootDir,
      publicBaseUrl: '/media',
    });
    await objectStore.putStream(
      'projects/demo/video.mp4',
      Readable.from('video-data'),
    );
    const config: AppConfig = {
      host: '0.0.0.0',
      port: 6001,
      maxUploadBytes: 1024,
      storage: { driver: 'local', rootDir, publicBaseUrl: '/media' },
    };
    const app = buildApp({ config, objectStore });

    const response = await app.inject({
      method: 'GET',
      url: '/media/projects/demo/video.mp4',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('video-data');
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('serves byte ranges required by mobile video players', async () => {
    const rootDir = join(tmpdir(), `studio-media-${crypto.randomUUID()}`);
    const objectStore = new LocalObjectStore({
      rootDir,
      publicBaseUrl: '/media',
    });
    await objectStore.putStream(
      'projects/demo/video.mp4',
      Readable.from('0123456789'),
    );
    const config: AppConfig = {
      host: '0.0.0.0',
      port: 6001,
      maxUploadBytes: 1024,
      storage: { driver: 'local', rootDir, publicBaseUrl: '/media' },
    };
    const app = buildApp({ config, objectStore });

    const response = await app.inject({
      method: 'GET',
      url: '/media/projects/demo/video.mp4',
      headers: { range: 'bytes=2-5' },
    });

    expect(response.statusCode).toBe(206);
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-range']).toBe('bytes 2-5/10');
    expect(response.headers['content-length']).toBe('4');
    expect(response.body).toBe('2345');
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('streams an asset from any shared object store', async () => {
    const objectStore = new MemoryObjectStore();
    await objectStore.putStream(
      'projects/demo/video.mp4',
      Readable.from('shared-video-data'),
    );
    const config: AppConfig = {
      host: '0.0.0.0',
      port: 6001,
      maxUploadBytes: 1024,
      storage: {
        driver: 'oss',
        credentialMode: 'managed',
        bucket: 'interactive-drama',
        publicBaseUrl: '/media',
      },
    };
    const app = buildApp({ config, objectStore });

    const response = await app.inject({
      method: 'GET',
      url: '/media/projects/demo/video.mp4',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('shared-video-data');
    await app.close();
  });

  it('returns 404 for a missing local asset', async () => {
    const rootDir = join(tmpdir(), `studio-media-${crypto.randomUUID()}`);
    const objectStore = new LocalObjectStore({
      rootDir,
      publicBaseUrl: '/media',
    });
    const config: AppConfig = {
      host: '0.0.0.0',
      port: 6001,
      maxUploadBytes: 1024,
      storage: { driver: 'local', rootDir, publicBaseUrl: '/media' },
    };
    const app = buildApp({ config, objectStore });

    const response = await app.inject({
      method: 'GET',
      url: '/media/missing.mp4',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: '素材不存在' });
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });
});
