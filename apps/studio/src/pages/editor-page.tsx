import { ArrowLeftOutlined, CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { Alert, Button, Segmented, Skeleton } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from 'zustand';

import { AssetLibrary } from '../features/assets/asset-library.js';
import { StoryGraph } from '../features/graph/story-graph.js';
import { NodePanel } from '../features/node/node-panel.js';
import { DraftPreview } from '../features/preview/draft-preview.js';
import { PublishPanel } from '../features/publish/publish-panel.js';
import { draftStore } from '../stores/draft-store.js';

function SaveState() {
  const status = useStore(draftStore, (state) => state.saveStatus);
  if (status === 'saving') return <span><SyncOutlined spin /> 正在保存</span>;
  if (status === 'error') {
    return <Button danger size="small" onClick={() => void draftStore.getState().saveNow()}>保存失败，重试</Button>;
  }
  return <span><CheckCircleOutlined /> 已保存</span>;
}

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const draft = useStore(draftStore, (state) => state.draft);
  const loadStatus = useStore(draftStore, (state) => state.loadStatus);
  const [workspace, setWorkspace] = useState<'graph' | 'assets' | 'publish'>('graph');
  useEffect(() => {
    if (id) void draftStore.getState().loadDraft(id);
  }, [id]);

  if (loadStatus === 'loading' || loadStatus === 'idle') {
    return <main className="editor-loading"><Skeleton active paragraph={{ rows: 6 }} /></main>;
  }
  if (loadStatus === 'error' || !draft) {
    return <main className="editor-loading"><Alert type="error" title="作品加载失败" showIcon /></main>;
  }

  return (
    <main className="editor-page">
      <header className="editor-header">
        <div className="editor-header__project">
          <Button type="text" aria-label="返回作品列表" icon={<ArrowLeftOutlined />} onClick={() => navigate('/studio')} />
          <strong>{draft.title}</strong>
        </div>
        <Segmented
          options={[
            { label: '剧情编排', value: 'graph' },
            { label: '视频素材', value: 'assets' },
            { label: '预览发布', value: 'publish' },
          ]}
          value={workspace}
          onChange={(value) => setWorkspace(value as typeof workspace)}
        />
        <div className="editor-save-state"><SaveState /></div>
      </header>
      {workspace === 'graph' && (
        <div className="editor-workspace">
          <StoryGraph />
          <NodePanel />
        </div>
      )}
      {workspace === 'assets' && (
        <div className="editor-single-workspace"><AssetLibrary /></div>
      )}
      {workspace === 'publish' && (
        <div className="editor-single-workspace preview-publish-workspace">
          <DraftPreview draft={draft} />
          <PublishPanel onLocateNode={() => setWorkspace('graph')} />
        </div>
      )}
    </main>
  );
}
