import type { Asset, ProjectDraft } from '@interactive-drama/domain';
import type { FastifyInstance } from 'fastify';
import type { Readable } from 'node:stream';
import { z } from 'zod';

import type { ObjectStore } from '../../storage/object-store.js';
import { ProjectRepository } from '../projects/repository.js';

const UploadTargetSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.literal('video/mp4'),
  size: z.number().int().positive(),
  duration: z.number().nonnegative(),
});

type RegisterAssetRouteOptions = {
  objectStore: ObjectStore;
  repository: ProjectRepository;
  maxUploadBytes: number;
};

function assetKey(projectId: string, assetId: string): string {
  return `projects/${projectId}/assets/${assetId}.mp4`;
}

export function registerAssetRoutes(
  app: FastifyInstance,
  options: RegisterAssetRouteOptions,
): void {
  app.addContentTypeParser('video/mp4', (_request, payload, done) => {
    done(null, payload);
  });

  app.post<{ Params: { id: string } }>(
    '/api/projects/:id/assets/upload-target',
    async (request, reply) => {
      const parsed = UploadTargetSchema.safeParse(request.body);
      if (
        !parsed.success ||
        !parsed.data.fileName.toLowerCase().endsWith('.mp4')
      ) {
        return reply.code(400).send({ message: '仅支持MP4视频' });
      }
      if (parsed.data.size > options.maxUploadBytes) {
        return reply.code(400).send({ message: '视频文件超过上传大小限制' });
      }
      if (!(await options.repository.getDraft(request.params.id))) {
        return reply.code(404).send({ message: '作品不存在' });
      }

      const assetId = crypto.randomUUID();
      const objectKey = assetKey(request.params.id, assetId);
      const signedUrl = await options.objectStore.signedPutUrl(
        objectKey,
        parsed.data.contentType,
      );
      const asset: Asset = {
        id: assetId,
        fileName: parsed.data.fileName,
        objectKey,
        url: options.objectStore.publicUrl(objectKey),
        duration: parsed.data.duration,
        status: 'available',
      };

      return {
        asset,
        uploadUrl:
          signedUrl ?? `/api/uploads/${request.params.id}/${assetId}`,
        method: 'PUT' as const,
        headers: { 'Content-Type': 'video/mp4' },
      };
    },
  );

  app.put<{
    Params: { projectId: string; assetId: string };
    Body: Readable;
  }>(
    '/api/uploads/:projectId/:assetId',
    async (request, reply) => {
      if (!(await options.repository.getDraft(request.params.projectId))) {
        return reply.code(404).send({ message: '作品不存在' });
      }
      await options.objectStore.putStream(
        assetKey(request.params.projectId, request.params.assetId),
        request.body,
      );
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string; assetId: string } }>(
    '/api/projects/:id/assets/:assetId',
    async (request, reply) => {
      const draft = await options.repository.getDraft(request.params.id);
      if (!draft) {
        return reply.code(404).send({ message: '作品不存在' });
      }
      const asset = draft.assets.find(
        (item) => item.id === request.params.assetId,
      );
      if (!asset) {
        return reply.code(404).send({ message: '素材不存在' });
      }
      const nodeIds = draft.nodes
        .filter((node) => node.videoAssetId === asset.id)
        .map((node) => node.id);
      if (nodeIds.length > 0) {
        return reply
          .code(409)
          .send({ message: '请先从节点解绑该视频', nodeIds });
      }

      await options.objectStore.delete(asset.objectKey);
      const nextDraft: ProjectDraft = {
        ...draft,
        assets: draft.assets.filter((item) => item.id !== asset.id),
      };
      await options.repository.saveDraft(nextDraft);
      return reply.code(204).send();
    },
  );
}
