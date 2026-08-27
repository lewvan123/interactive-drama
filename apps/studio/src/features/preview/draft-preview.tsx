import { isBranchingNode, type ProjectDraft } from '@interactive-drama/domain';
import { Alert, Button } from 'antd';
import { useEffect, useMemo, useState } from 'react';

export function DraftPreview({ draft }: { draft: ProjectDraft }) {
  const [currentNodeId, setCurrentNodeId] = useState(draft.startNodeId);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    setCurrentNodeId(draft.startNodeId);
    setEnded(false);
  }, [draft.id, draft.startNodeId]);

  const currentNode = draft.nodes.find((node) => node.id === currentNodeId);
  const asset = draft.assets.find((item) => item.id === currentNode?.videoAssetId);
  const scriptText = currentNode?.scriptText.trim() ?? '';
  const choicePrompt = currentNode?.choicePrompt?.trim() || '你会怎么选？';
  const orderedChoices = useMemo(
    () => [...(currentNode?.choices ?? [])].sort((left, right) => left.order - right.order),
    [currentNode?.choices],
  );

  function reset() {
    setCurrentNodeId(draft.startNodeId);
    setEnded(false);
  }

  function handleEnded() {
    if (currentNode && !isBranchingNode(currentNode) && orderedChoices[0]) {
      setCurrentNodeId(orderedChoices[0].targetNodeId);
      setEnded(false);
      return;
    }
    setEnded(true);
  }

  function goToNode(nodeId: string) {
    setCurrentNodeId(nodeId);
    setEnded(false);
  }

  if (!draft.startNodeId || !currentNode) {
    return <Alert type="warning" showIcon title="请先配置有效的起点节点" />;
  }

  return (
    <section className="draft-preview">
      <div className="draft-preview__header">
        <div>
          <span>草稿预览</span>
          <h2>{currentNode.title}</h2>
        </div>
        <Button onClick={reset}>重新开始</Button>
      </div>
      <div className="draft-preview__player">
        {asset ? (
          <video
            key={currentNode.id}
            aria-label="剧情视频"
            src={asset.url}
            controls
            autoPlay
            playsInline
            onEnded={handleEnded}
          />
        ) : scriptText ? (
          <div className="draft-preview__script" role="region" aria-label="剧情剧本">
            <div className="draft-preview__script-body">{scriptText}</div>
            <div className="draft-preview__text-actions">
              {currentNode.type === 'ending' ? (
                <div className="draft-preview__ending">已到达结局</div>
              ) : isBranchingNode(currentNode) ? (
                <>
                  <p className="draft-preview__choice-prompt">{choicePrompt}</p>
                  {orderedChoices.map((choice) => (
                    <Button
                      key={choice.id}
                      size="large"
                      onClick={() => goToNode(choice.targetNodeId)}
                    >
                      {choice.text}
                    </Button>
                  ))}
                </>
              ) : orderedChoices[0] ? (
                <Button
                  type="primary"
                  size="large"
                  onClick={() => goToNode(orderedChoices[0]!.targetNodeId)}
                >
                  继续
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="draft-preview__missing">当前节点尚未绑定视频或填写剧本</div>
        )}
        {ended && currentNode && isBranchingNode(currentNode) && (
          <div className="draft-preview__choices">
            <p className="draft-preview__choice-prompt">{choicePrompt}</p>
            {orderedChoices.map((choice) => (
              <Button
                key={choice.id}
                size="large"
                onClick={() => goToNode(choice.targetNodeId)}
              >
                {choice.text}
              </Button>
            ))}
          </div>
        )}
        {ended && currentNode.type === 'ending' && (
          <div className="draft-preview__ending">已到达结局</div>
        )}
      </div>
    </section>
  );
}
