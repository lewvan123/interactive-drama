import { Readable } from 'node:stream';

import type { ByteRange, ObjectStore } from '../storage/object-store.js';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, Buffer>();

  constructor(readonly uploadUrl: string | null = null) {}

  async getJson<T>(key: string): Promise<T | null> {
    const value = this.objects.get(key);
    return value ? (JSON.parse(value.toString('utf8')) as T) : null;
  }

  async putJson(key: string, value: unknown): Promise<void> {
    this.objects.set(key, Buffer.from(JSON.stringify(value)));
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort();
  }

  async putStream(key: string, stream: Readable): Promise<void> {
    this.objects.set(key, await streamToBuffer(stream));
  }

  async getSize(key: string): Promise<number> {
    const value = this.objects.get(key);
    if (!value) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }
    return value.length;
  }

  async openReadStream(key: string, range?: ByteRange): Promise<Readable> {
    const value = this.objects.get(key);
    if (!value) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }
    return Readable.from(range ? value.subarray(range.start, range.end + 1) : value);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async signedPutUrl(): Promise<string | null> {
    return this.uploadUrl;
  }

  publicUrl(key: string): string {
    return `https://media.example.com/${key}`;
  }
}
