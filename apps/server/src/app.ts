import type { FastifyInstance } from 'fastify';
import fastify from 'fastify';

import { type AppConfig, loadConfig } from './config.js';
import { registerAssetRoutes } from './features/assets/routes.js';
import { registerProjectRoutes } from './features/projects/routes.js';
import { ProjectRepository } from './features/projects/repository.js';
import { registerPublishingRoutes } from './features/publishing/routes.js';
import { createObjectStore } from './storage/create-object-store.js';
import type { ObjectStore } from './storage/object-store.js';
import { DEFAULT_STUDIO_ROOT, registerStudioStatic } from './static.js';

type ParsedByteRange = {
  start: number;
  end: number;
};

function parseByteRange(header: string, size: number): ParsedByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }

  return { start, end: Math.min(requestedEnd, size - 1) };
}

type BuildAppOptions = {
  config?: AppConfig;
  objectStore?: ObjectStore;
  studioRoot?: string | false;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig(process.env);
  const objectStore = options.objectStore ?? createObjectStore(config);
  const app = fastify({ bodyLimit: config.maxUploadBytes });
  const repository = new ProjectRepository(objectStore);

  app.decorate('objectStore', objectStore);

  app.get('/healthz', async () => ({ status: 'ok' }));
  registerProjectRoutes(app, repository);
  registerAssetRoutes(app, {
    objectStore,
    repository,
    maxUploadBytes: config.maxUploadBytes,
  });
  registerPublishingRoutes(app, { objectStore, repository });

  const studioRoot = options.studioRoot === undefined
    ? process.env.NODE_ENV === 'production' ? DEFAULT_STUDIO_ROOT : false
    : options.studioRoot;
  if (studioRoot) registerStudioStatic(app, studioRoot);

  app.get<{ Params: { '*': string } }>('/media/*', async (request, reply) => {
    try {
      const key = request.params['*'];
      const size = await objectStore.getSize(key);
      const rangeHeader = request.headers.range;
      const range = rangeHeader ? parseByteRange(rangeHeader, size) : undefined;

      reply.type('video/mp4').header('accept-ranges', 'bytes');
      if (rangeHeader && !range) {
        return reply
          .code(416)
          .header('content-range', `bytes */${size}`)
          .send();
      }

      const stream = await objectStore.openReadStream(key, range ?? undefined);
      if (range) {
        return reply
          .code(206)
          .header('content-range', `bytes ${range.start}-${range.end}/${size}`)
          .header('content-length', String(range.end - range.start + 1))
          .send(stream);
      }

      return reply.header('content-length', String(size)).send(stream);
    } catch {
      return reply.code(404).send({ message: '素材不存在' });
    }
  });

  return app;
}
