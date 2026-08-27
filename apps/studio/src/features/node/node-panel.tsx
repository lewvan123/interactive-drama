import { Input, Modal } from 'antd';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';

import { draftStore, type DraftStore } from '../../stores/draft-store.js';
import { ChoicesTab } from './choices-tab.js';
import { ScriptTab } from './script-tab.js';
import { VideoTab } from './video-tab.js';

export function NodePanel({ store = draftStore }: { store?: DraftStore }) {
  const draft = useStore(store, (state) => state.draft);
  const selectedNodeId = useStore(store, (state) => state.selectedNodeId);
  const selectedChoiceId = useStore(store, (state) => state.selectedChoiceId);
  const [confirmEnding, setConfirmEnding] = useState(false);
  const [activeTab, setActiveTab] = useState<'script' | 'video' | 'choices'>('script');
  const node = draft?.nodes.find((candidate) => candidate.id === selectedNodeId);

  useEffect(() => {
    if (selectedChoiceId) setActiveTab('choices');
  }, [selectedChoiceId]);

  if (!draft || !node) {
    return <aside className="node-panel node-panel--empty">选择一个剧情节点开始编辑</aside>;
  }
  const activeNode = node;

  const applyPatch = (patch: Parameters<ReturnType<typeof store.getState>['updateNode']>[1]) => {
    store.getState().updateNode(activeNode.id, patch);
  };

  function changeType(nextType: 'normal' | 'ending') {
    if (nextType === 'ending' && activeNode.choices.length > 0) {
      setConfirmEnding(true);
      return;
    }
    applyPatch({ type: nextType });
  }

  return (
    <aside className="node-panel">
      <div className="node-panel__header">
        <span>节点配置</span>
        {draft.startNodeId === activeNode.id && <small>起点</small>}
      </div>
      <div className="node-panel__basics">
        <label>
          <span>节点名称</span>
          <Input value={activeNode.title} onChange={(event) => applyPatch({ title: event.target.value })} />
        </label>
        <label>
          <span>节点类型</span>
          <select
            aria-label="节点类型"
            value={activeNode.type}
            onChange={(event) => changeType(event.target.value as 'normal' | 'ending')}
          >
            <option value="normal">普通节点</option>
            <option value="ending">结局节点</option>
          </select>
        </label>
      </div>
      <div className="node-tabs" role="tablist" aria-label="节点内容">
        <button role="tab" aria-selected={activeTab === 'script'} onClick={() => setActiveTab('script')}>剧本</button>
        <button role="tab" aria-selected={activeTab === 'video'} onClick={() => setActiveTab('video')}>视频</button>
        <button role="tab" aria-selected={activeTab === 'choices'} disabled={activeNode.type === 'ending'} onClick={() => setActiveTab('choices')}>后续</button>
      </div>
      <div className="node-tab-panel" role="tabpanel">
        {activeTab === 'script' && (
          <ScriptTab value={activeNode.scriptText} onChange={(scriptText) => applyPatch({ scriptText })} />
        )}
        {activeTab === 'video' && (
          <VideoTab assets={draft.assets} videoAssetId={activeNode.videoAssetId} onChange={(videoAssetId) => applyPatch({ videoAssetId })} />
        )}
        {activeTab === 'choices' && activeNode.type === 'normal' && (
          <ChoicesTab
            node={activeNode}
            nodes={draft.nodes}
            selectedChoiceId={selectedChoiceId}
            onChange={(choices) => applyPatch({ choices })}
            onPromptChange={(choicePrompt) => applyPatch({ choicePrompt })}
            onAddBranch={() => {
              if (store.getState().addBranchNode(activeNode.id)) {
                setActiveTab('script');
              }
            }}
          />
        )}
      </div>
      <Modal
        open={confirmEnding}
        title="改为结局节点？"
        okText="改为结局"
        cancelText="取消"
        onCancel={() => setConfirmEnding(false)}
        onOk={() => {
          applyPatch({ type: 'ending', choices: [] });
          setActiveTab('script');
          setConfirmEnding(false);
        }}
      >
        当前节点已有后续连接，改为结局后会清空全部连接。
      </Modal>
    </aside>
  );
}
