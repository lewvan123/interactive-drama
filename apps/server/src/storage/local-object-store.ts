import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  type ByteRange,
  encodeObjectKey,
  type ObjectStore,
} from './object-store.js';

type LocalObjectStoreOptions = {
  rootDir: string;
  publicBaseUrl: string;
};

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

export class LocalObjectStore implements ObjectStore {
  readonly #rootDir: string;
  readonly #publicBaseUrl: string;

  constructor(options: LocalObjectStoreOptions) {
    this.#rootDir = resolve(options.rootDir);
    this.#publicBaseUrl = options.publicBaseUrl.replace(/\/$/, '');
  }

  resolvePath(key: string): string {
    if (key.length === 0 || isAbsolute(key) || key.split(/[\\/]/).includes('..')) {
      throw new Error('非法存储路径');
    }

    const filePath = resolve(this.#rootDir, key);
    const pathFromRoot = relative(this.#rootDir, filePath);
    if (pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '..') {
      throw new Error('非法存储路径');
    }
    return filePath;
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const content = await readFile(this.resolvePath(key), 'utf8');
      return JSON.parse(content) as T;
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }
      throw error;
    }
  }

  async putJson(key: string, value: unknown): Promise<void> {
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(value), 'utf8');
    await rename(temporaryPath, filePath);
  }

  async list(prefix: string): Promise<string[]> {
    const prefixPath = this.resolvePath(prefix);
    const result: string[] = [];

    const visit = async (directory: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (isMissingFile(error)) {
          return;
        }
        throw error;
      }

      for (const entry of entries) {
        const entryPath = resolve(directory, entry.name);
        if (entry.isDirectory()) {
          await visit(entryPath);
        } else if (entry.isFile() && !entry.name.endsWith('.tmp')) {
          result.push(relative(this.#rootDir, entryPath).split(sep).join('/'));
        }
      }
    };

    await visit(prefixPath);
    return result.sort();
  }

  async putStream(key: string, stream: Readable): Promise<void> {
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    await pipeline(stream, createWriteStream(temporaryPath));
    await rename(temporaryPath, filePath);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolvePath(key), { force: true });
  }

  async signedPutUrl(): Promise<null> {
    return null;
  }

  publicUrl(key: string): string {
    return `${this.#publicBaseUrl}/${encodeObjectKey(key)}`;
  }

  async getSize(key: string): Promise<number> {
    const metadata = await stat(this.resolvePath(key));
    return metadata.size;
  }

  async openReadStream(
    key: string,
    range?: ByteRange,
  ): Promise<ReturnType<typeof createReadStream>> {
    const filePath = this.resolvePath(key);
    await access(filePath);
    return createReadStream(filePath, range);
  }
}
