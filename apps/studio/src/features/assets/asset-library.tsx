import { CloudUploadOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Asset } from '@interactive-drama/domain';
import { Alert, Button, Empty, Modal, Progress } from 'antd';
import { useCallback, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { api } from '../../api/client.js';
import { draftStore, type DraftStore } from '../../stores/draft-store.js';
import { useVideoUpload, type VideoUploadApi } from './use-video-upload.js';

export type AssetLibraryApi = VideoUploadApi & Pick<typeof api, 'deleteAsset'>;

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}

export function AssetLibrary({
  store = draftStore,
  client = api,
}: {
  store?: DraftStore;
  client?: AssetLibraryApi;
}) {
  const draft = useStore(store, (state) => state.draft);
  const inputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const onUploaded = useCallback((asset: Asset) => store.getState().addAsset(asset), [store]);
  const uploads = useVideoUpload({
    projectId: draft?.id ?? '',
    client,
    onUploaded,
  });

  if (!draft) return null;
  const activeDraft = draft;

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      setDeleteError(null);
      await client.deleteAsset(activeDraft.id, deleteTarget.id);
      store.getState().removeAsset(deleteTarget.id);
      setDeleteTarget(null);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : '删除失败，请重试');
    }
  }

  return (
    <section className="asset-library">
      <div className="asset-library__header">
        <div>
          <h2>视频素材</h2>
          <p>上传 MP4 成片，再到剧情节点中完成绑定。</p>
        </div>
        <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => inputRef.current?.click()}>
          上传视频
        </Button>
        <input
          ref={inputRef}
          className="visually-hidden"
          aria-label="上传视频文件"
          type="file"
          multiple
          accept=".mp4,video/mp4"
          onChange={(event) => {
            for (const file of Array.from(event.target.files ?? [])) uploads.upload(file);
            event.target.value = '';
          }}
        />
      </div>
      {deleteError && <Alert type="error" showIcon title={deleteError} />}
      <div className="asset-grid">
        {uploads.items.filter((item) => item.status !== 'available').map((item) => (
          <article className="asset-card" key={item.id}>
            <div className="asset-card__placeholder">{item.file.name}</div>
            {item.status === 'failed' ? (
              <>
                <Alert type="error" title={item.error} />
                <Button icon={<ReloadOutlined />} onClick={() => uploads.retry(item.id)}>重新上传</Button>
              </>
            ) : (
              <Progress percent={item.progress} size="small" status="active" />
            )}
          </article>
        ))}
        {activeDraft.assets.map((asset) => {
          const boundNodes = activeDraft.nodes.filter((node) => node.videoAssetId === asset.id);
          const isBound = boundNodes.length > 0;
          return (
            <article className="asset-card" key={asset.id}>
              <video controls preload="metadata" src={asset.url} aria-label={`${asset.fileName} 预览`} />
              <div className="asset-card__name">
                <strong>{asset.fileName}</strong>
                <span>{formatDuration(asset.duration)}</span>
              </div>
              {isBound ? (
                <>
                  <span>已绑定：{boundNodes.map((node) => node.title).join('、')}</span>
                  <small>请先在对应节点解除绑定</small>
                </>
              ) : <span>尚未绑定节点</span>}
              <Button
                danger
                icon={<DeleteOutlined />}
                aria-label={`删除 ${asset.fileName}`}
                disabled={isBound}
                onClick={() => setDeleteTarget(asset)}
              >
                删除
              </Button>
            </article>
          );
        })}
      </div>
      {activeDraft.assets.length === 0 && uploads.items.length === 0 && (
        <Empty description="还没有视频素材，先上传第一段成片" />
      )}
      <Modal
        open={Boolean(deleteTarget)}
        title="删除视频素材？"
        okText="确认删除"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onCancel={() => setDeleteTarget(null)}
        onOk={() => void confirmDelete()}
      >
        删除后无法恢复，请确认该素材不再需要。
      </Modal>
    </section>
  );
}
