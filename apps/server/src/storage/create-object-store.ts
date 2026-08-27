import type { AppConfig } from '../config.js';
import { LocalObjectStore } from './local-object-store.js';
import type { ObjectStore } from './object-store.js';

export function createObjectStore(config: AppConfig): ObjectStore {
  return new LocalObjectStore({
    rootDir: config.storage.rootDir,
    publicBaseUrl: config.storage.publicBaseUrl,
  });
}
