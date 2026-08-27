import type { Readable } from 'node:stream';

export type ByteRange = {
  start: number;
  end: number;
};

export interface ObjectStore {
  getJson<T>(key: string): Promise<T | null>;
  putJson(key: string, value: unknown): Promise<void>;
  list(prefix: string): Promise<string[]>;
  putStream(key: string, stream: Readable): Promise<void>;
  getSize(key: string): Promise<number>;
  openReadStream(key: string, range?: ByteRange): Promise<Readable>;
  delete(key: string): Promise<void>;
  signedPutUrl(key: string, contentType: string): Promise<string | null>;
  publicUrl(key: string): string;
}

export function encodeObjectKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}
