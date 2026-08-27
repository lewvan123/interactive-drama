import type { Asset } from '@interactive-drama/domain';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useVideoUpload,
  type VideoUploadApi,
} from './use-video-upload.js';

const asset: Asset = {
  id: 'video-1',
  fileName: '暴雪.mp4',
  objectKey: 'projects/demo/assets/video-1.mp4',
  url: '/media/video-1.mp4',
  duration: 12,
  status: 'available',
};

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  readonly upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  readonly headers: Record<string, string> = {};
  method = '';
  url = '';
  status = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(_body: XMLHttpRequestBodyInit) {}

  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }

  succeed() {
    this.status = 200;
    this.onload?.();
  }

  fail() {
    this.onerror?.();
  }
}

function createApi(): VideoUploadApi {
  return {
    createUploadTarget: vi.fn().mockResolvedValue({
      asset,
      uploadUrl: '/api/uploads/demo/video-1',
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'x-demo': 'signed' },
    }),
  };
}

beforeEach(() => {
  FakeXMLHttpRequest.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useVideoUpload', () => {
  it('uploads an MP4 with progress and inserts the asset only after PUT succeeds', async () => {
    const api = createApi();
    const onUploaded = vi.fn();
    const readDuration = vi.fn().mockResolvedValue(12);
    const { result } = renderHook(() =>
      useVideoUpload({ projectId: 'demo', client: api, onUploaded, readDuration }),
    );
    const file = new File(['video'], '暴雪.mp4', { type: 'video/mp4' });

    act(() => result.current.upload(file));
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    const xhr = FakeXMLHttpRequest.instances[0]!;
    expect(readDuration).toHaveBeenCalledWith(file);
    expect(api.createUploadTarget).toHaveBeenCalledWith('demo', {
      fileName: '暴雪.mp4',
      contentType: 'video/mp4',
      size: file.size,
      duration: 12,
    });
    expect(xhr).toMatchObject({
      method: 'PUT',
      url: '/api/uploads/demo/video-1',
      headers: { 'Content-Type': 'video/mp4', 'x-demo': 'signed' },
    });
    expect(onUploaded).not.toHaveBeenCalled();

    act(() => xhr.progress(25, 100));
    expect(result.current.items[0]?.progress).toBe(25);
    act(() => xhr.succeed());

    await waitFor(() => expect(result.current.items[0]?.status).toBe('available'));
    expect(onUploaded).toHaveBeenCalledWith(asset);
  });

  it.each([
    [new File(['x'], '暴雪.mov', { type: 'video/quicktime' }), 500, '仅支持 MP4 视频'],
    [new File(['x'], '暴雪.mp4', { type: 'application/octet-stream' }), 500, '仅支持 MP4 视频'],
    [new File(['too-large'], '暴雪.mp4', { type: 'video/mp4' }), 2, '视频文件超过上传大小限制'],
  ])('rejects an invalid file before requesting a target', async (file, maxBytes, message) => {
    const api = createApi();
    const { result } = renderHook(() =>
      useVideoUpload({
        projectId: 'demo',
        client: api,
        onUploaded: vi.fn(),
        maxBytes,
        readDuration: vi.fn().mockResolvedValue(12),
      }),
    );

    act(() => result.current.upload(file));

    await waitFor(() => expect(result.current.items[0]?.status).toBe('failed'));
    expect(result.current.items[0]?.error).toBe(message);
    expect(api.createUploadTarget).not.toHaveBeenCalled();
  });

  it('retries a failed PUT with the same file', async () => {
    const api = createApi();
    const onUploaded = vi.fn();
    const { result } = renderHook(() =>
      useVideoUpload({
        projectId: 'demo',
        client: api,
        onUploaded,
        readDuration: vi.fn().mockResolvedValue(12),
      }),
    );

    act(() => result.current.upload(new File(['video'], '暴雪.mp4', { type: 'video/mp4' })));
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    act(() => FakeXMLHttpRequest.instances[0]!.fail());
    await waitFor(() => expect(result.current.items[0]?.status).toBe('failed'));

    act(() => result.current.retry(result.current.items[0]!.id));
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(2));
    act(() => FakeXMLHttpRequest.instances[1]!.succeed());

    await waitFor(() => expect(result.current.items[0]?.status).toBe('available'));
    expect(onUploaded).toHaveBeenCalledOnce();
  });
});
