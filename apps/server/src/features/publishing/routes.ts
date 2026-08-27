import {
  buildPublishedManifest,
  type PublishedManifest,
  validateDraft,
} from '@interactive-drama/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ObjectStore } from '../../storage/object-store.js';
import { ProjectRepository } from '../projects/repository.js';

type ReleaseSummary = {
  version: string;
  publishedAt: string;
  manifestUrl: string;
};

type RegisterPublishingRouteOptions = {
  objectStore: ObjectStore;
  repository: ProjectRepository;
};

function releaseRoot(projectId: string, version: string): string {
  return `projects/${projectId}/releases/${version}`;
}

async function listReleases(
  objectStore: ObjectStore,
  projectId: string,
): Promise<ReleaseSummary[]> {
  const keys = await objectStore.list(`projects/${projectId}/releases/`);
  const metas = await Promise.all(
    keys
      .filter((key) => key.endsWith('/meta.json'))
      .map((key) => objectStore.getJson<ReleaseSummary>(key)),
  );
  return metas
    .filter((meta): meta is ReleaseSummary => meta !== null)
    .sort(
      (left, right) =>
        Number(right.version.slice(1)) - Number(left.version.slice(1)),
    );
}

export function registerPublishingRoutes(
  app: FastifyInstance,
  options: RegisterPublishingRouteOptions,
): void {
  app.get<{
    Params: { id: string };
    Querystring: { version?: string };
  }>(
    '/api/public/projects/:id/manifest',
    async (request, reply) => {
      const parsed = z.object({
        version: z.string().regex(/^v[1-9]\d*$/).optional(),
      }).safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ message: '版本号不正确' });
      }

      const current = parsed.data.version
        ? { version: parsed.data.version }
        : await options.objectStore.getJson<ReleaseSummary>(
          `projects/${request.params.id}/current.json`,
        );
      if (!current) return reply.code(404).send({ message: '作品尚未发布' });

      const manifest = await options.objectStore.getJson<PublishedManifest>(
        `${releaseRoot(request.params.id, current.version)}/manifest.json`,
      );
      return manifest ?? reply.code(404).send({
        message: parsed.data.version ? '发布版本不存在' : '发布内容不存在',
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/projects/:id/validate',
    async (request, reply) => {
      const draft = await options.repository.getDraft(request.params.id);
      if (!draft) {
        return reply.code(404).send({ message: '作品不存在' });
      }
      const issues = validateDraft(draft);
      return { valid: issues.length === 0, issues };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/projects/:id/publish',
    async (request, reply) => {
      const draft = await options.repository.getDraft(request.params.id);
      if (!draft) {
        return reply.code(404).send({ message: '作品不存在' });
      }
      const issues = validateDraft(draft);
      if (issues.length > 0) {
        return reply.code(409).send({ message: '发布检查未通过', issues });
      }

      const existing = await listReleases(options.objectStore, draft.id);
      const nextNumber = Math.max(
        0,
        ...existing.map((release) => Number(release.version.slice(1))),
      ) + 1;
      const version = `v${nextNumber}`;
      const root = releaseRoot(draft.id, version);
      const manifestKey = `${root}/manifest.json`;
      const manifest = buildPublishedManifest(draft, version);
      const release: ReleaseSummary = {
        version,
        publishedAt: new Date().toISOString(),
        manifestUrl: options.objectStore.publicUrl(manifestKey),
      };

      await options.objectStore.putJson(manifestKey, manifest);
      await options.objectStore.putJson(`${root}/meta.json`, release);
      await options.objectStore.putJson(
        `projects/${draft.id}/current.json`,
        release,
      );
      return reply.code(201).send(release);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/projects/:id/releases',
    async (request, reply) => {
      if (!(await options.repository.getDraft(request.params.id))) {
        return reply.code(404).send({ message: '作品不存在' });
      }
      return {
        releases: await listReleases(options.objectStore, request.params.id),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/projects/:id/current',
    async (request, reply) => {
      const current = await options.objectStore.getJson<ReleaseSummary>(
        `projects/${request.params.id}/current.json`,
      );
      return current ?? reply.code(404).send({ message: '尚未发布版本' });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/projects/:id/rollback',
    async (request, reply) => {
      const parsed = z
        .object({ version: z.string().regex(/^v[1-9]\d*$/) })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ message: '版本号不正确' });
      }
      const release = await options.objectStore.getJson<ReleaseSummary>(
        `${releaseRoot(request.params.id, parsed.data.version)}/meta.json`,
      );
      if (!release) {
        return reply.code(404).send({ message: '发布版本不存在' });
      }

      await options.objectStore.putJson(
        `projects/${request.params.id}/current.json`,
        release,
      );
      return release;
    },
  );
}
