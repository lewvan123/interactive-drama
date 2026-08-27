import { CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { ValidationIssue } from '@interactive-drama/domain';
import { Alert, Button, Modal, Spin } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';

import { api, type ReleaseSummary } from '../../api/client.js';
import { draftStore, type DraftStore } from '../../stores/draft-store.js';

export type PublishingApi = Pick<
  typeof api,
  | 'validateProject'
  | 'publishProject'
  | 'listReleases'
  | 'getCurrentRelease'
  | 'rollbackProject'
>;

function formatPublishedAt(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function PublishPanel({
  store = draftStore,
  client = api,
  onLocateNode,
}: {
  store?: DraftStore;
  client?: PublishingApi;
  onLocateNode?: (nodeId: string) => void;
}) {
  const draft = useStore(store, (state) => state.draft);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [current, setCurrent] = useState<ReleaseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [rollbackVersion, setRollbackVersion] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const projectId = store.getState().draft?.id;
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      await store.getState().saveNow();
      const [validation, releaseResult, currentRelease] = await Promise.all([
        client.validateProject(projectId),
        client.listReleases(projectId),
        client.getCurrentRelease(projectId),
      ]);
      setIssues(validation.issues);
      setReleases(releaseResult.releases);
      setCurrent(currentRelease);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发布信息加载失败');
    } finally {
      setLoading(false);
    }
  }, [client, store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function publish() {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      await store.getState().saveNow();
      const validation = await client.validateProject(draft.id);
      setIssues(validation.issues);
      if (!validation.valid) {
        setConfirmPublish(false);
        return;
      }
      await client.publishProject(draft.id);
      setConfirmPublish(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发布失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function rollback() {
    if (!draft || !rollbackVersion) return;
    setLoading(true);
    setError(null);
    try {
      await client.rollbackProject(draft.id, rollbackVersion);
      setRollbackVersion(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '回滚失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  if (!draft) return null;

  return (
    <section className="publish-panel">
      <div className="publish-panel__header">
        <div>
          <h2>发布检查</h2>
          <p>发布版本包含播放所需的视频或剧本与分支数据。</p>
        </div>
        <Button
          type="primary"
          disabled={loading || issues.length > 0}
          onClick={() => setConfirmPublish(true)}
        >
          发布新版本
        </Button>
      </div>
      {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => void refresh()}>重试</Button>} />}
      {loading && releases.length === 0 && issues.length === 0 ? (
        <div className="publish-panel__loading"><Spin /> 正在检查</div>
      ) : issues.length > 0 ? (
        <div className="publish-issues">
          <strong><ExclamationCircleOutlined /> 发现 {issues.length} 个问题</strong>
          {issues.map((issue, index) => (
            <div className="publish-issue" key={`${issue.code}-${issue.nodeId ?? 'project'}-${index}`}>
              <span>{issue.message}</span>
              {issue.nodeId && (
                <Button
                  size="small"
                  onClick={() => {
                    store.getState().selectNode(issue.nodeId!);
                    onLocateNode?.(issue.nodeId!);
                  }}
                >
                  定位节点
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Alert type="success" showIcon title="发布检查已通过" />
      )}

      <div className="release-list">
        <h3>发布记录</h3>
        {releases.length === 0 ? <p>还没有发布版本</p> : releases.map((release) => {
          const isCurrent = current?.version === release.version;
          return (
            <div className="release-row" key={release.version}>
              <div>
                <strong>{release.version}</strong>
                {isCurrent && <span><CheckCircleOutlined /> 当前版本</span>}
                <small>{formatPublishedAt(release.publishedAt)}</small>
              </div>
              <div className="release-row__actions">
                <a
                  href={`/play/${encodeURIComponent(draft.id)}?version=${encodeURIComponent(release.version)}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`播放 ${release.version} H5`}
                >
                  播放 H5
                </a>
                {!isCurrent && (
                  <Button size="small" aria-label={`回滚到 ${release.version}`} onClick={() => setRollbackVersion(release.version)}>
                    回滚
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={confirmPublish}
        title="确认发布新版本？"
        okText="确认发布"
        cancelText="取消"
        confirmLoading={loading}
        onCancel={() => setConfirmPublish(false)}
        onOk={() => void publish()}
      >
        系统会基于当前已保存草稿生成一个不可变的播放版本。
      </Modal>
      <Modal
        open={Boolean(rollbackVersion)}
        title={`回滚到 ${rollbackVersion ?? ''}？`}
        okText="确认回滚"
        cancelText="取消"
        confirmLoading={loading}
        onCancel={() => setRollbackVersion(null)}
        onOk={() => void rollback()}
      >
        回滚只会切换当前播放版本，不会覆盖草稿或删除更新的发布记录。
      </Modal>
    </section>
  );
}
