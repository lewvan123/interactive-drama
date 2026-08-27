import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { isBranchingNode, wouldCreateCycle, type Choice, type StoryNode } from '@interactive-drama/domain';
import { Button, Empty, Input } from 'antd';
import { useEffect, useRef } from 'react';

function normalizeChoices(choices: Choice[]) {
  return choices.map((choice, order) => ({ ...choice, order }));
}

export function ChoicesTab({
  node,
  nodes,
  selectedChoiceId,
  onChange,
  onPromptChange,
  onAddBranch,
}: {
  node: StoryNode;
  nodes: StoryNode[];
  selectedChoiceId?: string | null;
  onChange: (choices: Choice[]) => void;
  onPromptChange: (choicePrompt: string) => void;
  onAddBranch: () => void;
}) {
  const selectedChoiceRef = useRef<HTMLElement>(null);
  const isBranching = isBranchingNode(node);
  const targetNodes = nodes.filter(
    (candidate) =>
      candidate.id !== node.id &&
      !wouldCreateCycle(nodes, node.id, candidate.id),
  );

  useEffect(() => {
    selectedChoiceRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedChoiceId]);

  function updateChoice(id: string, patch: Partial<Choice>) {
    onChange(node.choices.map((choice) => choice.id === id ? { ...choice, ...patch } : choice));
  }

  function moveChoice(index: number, offset: -1 | 1) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= node.choices.length) return;
    const next = [...node.choices];
    [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
    onChange(normalizeChoices(next));
  }

  return (
    <div className="choices-tab">
      {isBranching && (
        <label className="choices-tab__prompt">
          <span>选择标题</span>
          <Input
            aria-label="选择标题"
            placeholder="你会怎么选？"
            value={node.choicePrompt ?? ''}
            onChange={(event) => onPromptChange(event.target.value)}
          />
        </label>
      )}
      {node.choices.length === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未连接后续节点" />
      )}
      <div className="choice-list">
        {node.choices.map((choice, index) => (
          <section
            className={`choice-row${choice.id === selectedChoiceId ? ' is-selected' : ''}`}
            data-choice-id={choice.id}
            key={choice.id}
            ref={choice.id === selectedChoiceId ? selectedChoiceRef : undefined}
          >
            {isBranching ? (
              <Input
                aria-label={`分支文案 ${index + 1}`}
                value={choice.text}
                onChange={(event) => updateChoice(choice.id, { text: event.target.value })}
              />
            ) : (
              <span className="choice-row__label">后续节点</span>
            )}
            <select
              aria-label={isBranching ? `目标节点 ${index + 1}` : '后续节点'}
              value={choice.targetNodeId}
              onChange={(event) => updateChoice(choice.id, { targetNodeId: event.target.value })}
            >
              <option value="">请选择目标节点</option>
              {targetNodes.map((target) => (
                <option key={target.id} value={target.id}>{target.title}</option>
              ))}
            </select>
            <div className="choice-row__actions">
              {isBranching && (
                <>
                  <Button
                    type="text"
                    icon={<ArrowUpOutlined />}
                    aria-label={`上移 ${choice.text}`}
                    disabled={index === 0}
                    onClick={() => moveChoice(index, -1)}
                  />
                  <Button
                    type="text"
                    icon={<ArrowDownOutlined />}
                    aria-label={`下移 ${choice.text}`}
                    disabled={index === node.choices.length - 1}
                    onClick={() => moveChoice(index, 1)}
                  />
                </>
              )}
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={isBranching ? `删除 ${choice.text}` : '删除后续连接'}
                onClick={() => onChange(normalizeChoices(node.choices.filter((item) => item.id !== choice.id)))}
              />
            </div>
          </section>
        ))}
      </div>
      <Button
        block
        icon={<PlusOutlined />}
        aria-label={node.choices.length === 0 ? '添加后续节点' : '添加分支'}
        onClick={onAddBranch}
      >
        {node.choices.length === 0 ? '添加后续节点' : '添加分支'}
      </Button>
    </div>
  );
}
