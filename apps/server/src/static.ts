import type { FastifyInstance, FastifyReply } from 'fastify';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_STUDIO_ROOT = fileURLToPath(new URL('./public', import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
};

async function sendFile(reply: FastifyReply, root: string, relativePath: string) {
  const absolutePath = resolve(root, relativePath);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
    return reply.code(404).send({ message: '页面不存在' });
  }
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) throw new Error('NOT_A_FILE');
    const contentType = CONTENT_TYPES[extname(absolutePath).toLowerCase()] ?? 'application/octet-stream';
    return reply.type(contentType).send(await readFile(absolutePath));
  } catch {
    return reply.code(404).send({ message: '页面不存在' });
  }
}

export function registerStudioStatic(app: FastifyInstance, rootDir = DEFAULT_STUDIO_ROOT) {
  const root = resolve(rootDir);
  app.get('/', async (_request, reply) => reply.redirect('/studio'));
  app.get('/play', async (_request, reply) => sendFile(reply, root, 'index.html'));
  app.get<{ Params: { '*': string } }>('/play/*', async (_request, reply) =>
    sendFile(reply, root, 'index.html'));
  app.get('/studio', async (_request, reply) => sendFile(reply, root, 'index.html'));
  app.get<{ Params: { '*': string } }>('/studio/*', async (request, reply) => {
    const requestedPath = request.params['*'];
    if (requestedPath && extname(requestedPath)) {
      return sendFile(reply, root, requestedPath);
    }
    return sendFile(reply, root, 'index.html');
  });
}
