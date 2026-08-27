import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('uses safe local-development defaults', () => {
    expect(loadConfig({})).toEqual({
      host: '127.0.0.1',
      port: 6001,
      maxUploadBytes: 524_288_000,
      storage: {
        driver: 'local',
        rootDir: '.data',
        publicBaseUrl: '/media',
      },
    });
  });

  it('rejects cloud storage configuration in the local deployment build', () => {
    expect(() => loadConfig({ STORAGE_DRIVER: 'oss' })).toThrow(
      '本地部署版仅支持本地文件存储',
    );
  });

  it('normalizes local storage and runtime overrides', () => {
    expect(loadConfig({
      STORAGE_DRIVER: 'local',
      LOCAL_STORAGE_ROOT: '/var/lib/interactive-drama',
      LOCAL_PUBLIC_BASE_URL: '/media/',
      PORT: '7001',
      MAX_UPLOAD_BYTES: '1000',
    })).toEqual({
      host: '127.0.0.1',
      port: 7001,
      maxUploadBytes: 1000,
      storage: {
        driver: 'local',
        rootDir: '/var/lib/interactive-drama',
        publicBaseUrl: '/media',
      },
    });
  });
});
