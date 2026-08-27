import type { Asset } from '@interactive-drama/domain';
import { useCallback, useState } from 'react';

import {
  api,
  type UploadTargetResponse,
} from '../../api/client.js';

export type VideoUploadApi = Pick<typeof api, 'createUploadTarget'>;

export type VideoUploadItem = {
  id: string;
  file: File;
  status: 'reading' | 'uploading' | 'available' | 'failed';
  progress: number;
  error?: string;
  asset?: Asset;
};

type UseVideoUploadOptions = {
  projectId: string;
  client?: VideoUploadApi;
  maxBytes?: number;
  onUploaded: (asset: Asset) => void;
  readDuration?: (file: File) => Promise<number>;
};

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;

function validateVideoFile(file: File, maxBytes: number) {
  if (!file.name.toLowerCase().endsWith('.mp4') || file.type !== 'video/mp4') {
    throw new Error('仅支持 MP4 视频');
  }
  if (file.size <= 0) throw new Error('视频文件不能为空');
  if (file.size > maxBytes) throw new Error('视频文件超过上传大小限制');
}

export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      if (Number.isFinite(duration) && duration >= 0) resolve(duration);
      else reject(new Error('无法读取视频时长'));
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('视频无法解码，请确认使用 H.264 视频和 AAC 音频'));
    };
    video.src = objectUrl;
  });
}

function putFile(
  target: UploadTargetResponse,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.uploadUrl);
    for (const [name, value] of Object.entries(target.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('上传失败，请重试'));
    };
    xhr.onerror = () => reject(new Error('上传失败，请重试'));
    xhr.send(file);
  });
}

export function useVideoUpload({
  projectId,
  client = api,
  maxBytes = DEFAULT_MAX_BYTES,
  onUploaded,
  readDuration = readVideoDuration,
}: UseVideoUploadOptions) {
  const [items, setItems] = useState<VideoUploadItem[]>([]);

  const updateItem = useCallback((id: string, patch: Partial<VideoUploadItem>) => {
    setItems((current) =>
      current.map((item) => item.id === id ? { ...item, ...patch } : item),
    );
  }, []);

  const runUpload = useCallback(async (id: string, file: File) => {
    try {
      validateVideoFile(file, maxBytes);
      updateItem(id, { status: 'reading', progress: 0 });
      const duration = await readDuration(file);
      const target = await client.createUploadTarget(projectId, {
        fileName: file.name,
        contentType: 'video/mp4',
        size: file.size,
        duration,
      });
      updateItem(id, { status: 'uploading', progress: 0 });
      await putFile(target, file, (progress) => updateItem(id, { progress }));
      onUploaded(target.asset);
      updateItem(id, {
        status: 'available',
        progress: 100,
        asset: target.asset,
      });
    } catch (cause) {
      updateItem(id, {
        status: 'failed',
        error: cause instanceof Error ? cause.message : '上传失败，请重试',
      });
    }
  }, [client, maxBytes, onUploaded, projectId, readDuration, updateItem]);

  const upload = useCallback((file: File) => {
    const id = crypto.randomUUID();
    setItems((current) => [
      ...current,
      { id, file, status: 'reading', progress: 0 },
    ]);
    void runUpload(id, file);
    return id;
  }, [runUpload]);

  const retry = useCallback((id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (item) void runUpload(id, item.file);
  }, [items, runUpload]);

  return { items, upload, retry };
}
