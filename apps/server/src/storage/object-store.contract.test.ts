import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalObjectStore } from './local-object-store.js';

describe('LocalObjectStore contract', () => {
  let rootDir: string;
  let store: LocalObjectStore;

  beforeEach(async () => {
    rootDir = join(
      tmpdir(),
      `interactive-drama-store-${crypto.randomUUID()}`,
    );
    store = new LocalObjectStore({ rootDir, publicBaseUrl: '/media' });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('round-trips JSON values', async () => {
    await store.putJson('projects/demo/draft.json', { title: '全球冰封' });

    await expect(store.getJson('projects/demo/draft.json')).resolves.toEqual({
      title: '全球冰封',
    });
  });

  it('returns null for a missing object', async () => {
    await expect(store.getJson('missing.json')).resolves.toBeNull();
  });

  it('lists only objects under the requested prefix', async () => {
    await store.putJson('projects/a/draft.json', { id: 'a' });
    await store.putJson('projects/b/draft.json', { id: 'b' });
    await store.putJson('releases/v1.json', { version: 1 });

    await expect(store.list('projects/')).resolves.toEqual([
      'projects/a/draft.json',
      'projects/b/draft.json',
    ]);
  });

  it('writes streams and deletes stored objects', async () => {
    await store.putStream('projects/a/video.mp4', Readable.from('video-data'));

    await expect(
      readFile(join(rootDir, 'projects/a/video.mp4'), 'utf8'),
    ).resolves.toBe('video-data');
    await store.delete('projects/a/video.mp4');
    await expect(store.list('projects/a/')).resolves.toEqual([]);
  });

  it('rejects path traversal', async () => {
    await expect(store.putJson('../escape.json', {})).rejects.toThrow(
      '非法存储路径',
    );
  });

  it('returns a browser-safe public URL', () => {
    expect(store.publicUrl('projects/冰封/第一集.mp4')).toBe(
      '/media/projects/%E5%86%B0%E5%B0%81/%E7%AC%AC%E4%B8%80%E9%9B%86.mp4',
    );
  });
});
