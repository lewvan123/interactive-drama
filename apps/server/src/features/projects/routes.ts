import { ProjectDraftSchema } from '@interactive-drama/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ProjectRepository } from './repository.js';

const CreateProjectSchema = z.object({
  title: z.string().trim().min(1),
});

export function registerProjectRoutes(
  app: FastifyInstance,
  repository: ProjectRepository,
): void {
  app.get('/api/projects', async () => ({ projects: await repository.list() }));

  app.post('/api/projects', async (request, reply) => {
    const parsed = CreateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: '请输入作品名称' });
    }

    const created = await repository.create(parsed.data.title);
    return reply.code(201).send(created);
  });

  app.get<{ Params: { id: string } }>(
    '/api/projects/:id/draft',
    async (request, reply) => {
      const draft = await repository.getDraft(request.params.id);
      return draft ?? reply.code(404).send({ message: '作品不存在' });
    },
  );

  app.put<{ Params: { id: string } }>(
    '/api/projects/:id/draft',
    async (request, reply) => {
      const parsed = ProjectDraftSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.id !== request.params.id) {
        return reply.code(400).send({ message: '草稿数据格式不正确' });
      }
      if (!(await repository.getDraft(request.params.id))) {
        return reply.code(404).send({ message: '作品不存在' });
      }

      return repository.saveDraft(parsed.data);
    },
  );
}
