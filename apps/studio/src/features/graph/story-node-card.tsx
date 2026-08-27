import { PlusOutlined } from '@ant-design/icons';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { SyntheticEvent } from 'react';

export type StoryNodeData = {
  title: string;
  isStart: boolean;
  isEnding: boolean;
  hasScript: boolean;
  hasVideo: boolean;
  targetHandles: Array<{ id: string | null; top: number }>;
  onAddBranch: () => void;
};

export type StoryFlowNode = Node<StoryNodeData, 'story'>;

export function StoryNodeCard({ data, selected }: NodeProps<StoryFlowNode>) {
  function addBranch(event: SyntheticEvent) {
    event.stopPropagation();
    data.onAddBranch();
  }

  return (
    <article className={`story-node-card${selected ? ' is-selected' : ''}`}>
      {data.targetHandles.map((handle) => (
        <Handle
          key={handle.id ?? 'default'}
          id={handle.id}
          type="target"
          position={Position.Left}
          style={{ top: `${handle.top}%` }}
        />
      ))}
      <div className="story-node-card__labels">
        {data.isStart && <span>起点</span>}
        {data.isEnding && <span>结局</span>}
      </div>
      <strong>{data.title}</strong>
      <div className="story-node-card__readiness">
        <span className={data.hasScript ? 'is-ready' : ''}>
          {data.hasScript ? '已有剧本' : '缺少剧本'}
        </span>
        <span className={data.hasVideo ? 'is-ready' : ''}>
          {data.hasVideo ? '已绑定视频' : '缺少视频'}
        </span>
      </div>
      {!data.isEnding && (selected ? (
        <Handle
          type="source"
          position={Position.Right}
          className="story-node-card__add-branch nodrag nopan"
          aria-label={`从${data.title}添加分支`}
          title="添加分支"
          role="button"
          tabIndex={0}
          onClick={addBranch}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              addBranch(event);
            }
          }}
        >
          <PlusOutlined />
        </Handle>
      ) : (
        <Handle type="source" position={Position.Right} />
      ))}
    </article>
  );
}
