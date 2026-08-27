import { z } from 'zod';

const CommonEnvironmentSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(6001),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(524_288_000),
});

const EnvironmentSchema = CommonEnvironmentSchema.extend({
  STORAGE_DRIVER: z.literal('local').default('local'),
  LOCAL_STORAGE_ROOT: z.string().default('.data'),
  LOCAL_PUBLIC_BASE_URL: z.string().default('/media'),
});

export type LocalStorageConfig = {
  driver: 'local';
  rootDir: string;
  publicBaseUrl: string;
};

export type AppConfig = {
  host: string;
  port: number;
  maxUploadBytes: number;
  storage: LocalStorageConfig;
};

function withoutTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  if (environment.STORAGE_DRIVER && environment.STORAGE_DRIVER !== 'local') {
    throw new Error('本地部署版仅支持本地文件存储');
  }
  const input = {
    ...environment,
    STORAGE_DRIVER: environment.STORAGE_DRIVER ?? 'local',
  };
  const result = EnvironmentSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`配置错误\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
    storage: {
      driver: 'local',
      rootDir: parsed.LOCAL_STORAGE_ROOT,
      publicBaseUrl: withoutTrailingSlash(parsed.LOCAL_PUBLIC_BASE_URL),
    },
  };
}
