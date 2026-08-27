import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { MemoryObjectStore } from './test-utils/memory-object-store.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createStudioRoot() {
  const root = await mkdtemp(join(tmpdir(), 'interactive-studio-'));
  temporaryRoots.push(root);
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<main>制作平台</main>');
  await writeFile(join(root, 'assets', 'app.js'), 'window.STUDIO = true;');
  return root;
}

describe('production studio static serving', () => {
  it('redirects the application root to the studio', async () => {
    const root = await createStudioRoot();
    const app = buildApp({ objectStore: new MemoryObjectStore(), studioRoot: root });

    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/studio');
    await app.close();
  });

  it('serves built assets and falls back to index for studio and player routes only', async () => {
    const root = await createStudioRoot();
    const app = buildApp({ objectStore: new MemoryObjectStore(), studioRoot: root });

    const index = await app.inject({ method: 'GET', url: '/studio' });
    const nested = await app.inject({ method: 'GET', url: '/studio/projects/demo/edit' });
    const asset = await app.inject({ method: 'GET', url: '/studio/assets/app.js' });
    const player = await app.inject({ method: 'GET', url: '/play/demo' });
    const apiMiss = await app.inject({ method: 'GET', url: '/api/not-found' });

    expect(index.statusCode).toBe(200);
    expect(nested.body).toContain('制作平台');
    expect(asset.headers['content-type']).toContain('javascript');
    expect(asset.body).toBe('window.STUDIO = true;');
    expect(player.statusCode).toBe(200);
    expect(player.body).toContain('制作平台');
    expect(apiMiss.statusCode).toBe(404);
    expect(apiMiss.body).not.toContain('制作平台');
    await app.close();
  });

  it('does not expose paths outside the studio build directory', async () => {
    const root = await createStudioRoot();
    const app = buildApp({ objectStore: new MemoryObjectStore(), studioRoot: root });

    const response = await app.inject({ method: 'GET', url: '/studio/%2e%2e/package.json' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
