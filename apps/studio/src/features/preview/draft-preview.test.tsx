import type { ProjectDraft } from '@interactive-drama/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DraftPreview } from './draft-preview.js';

const draft: ProjectDraft = {
  id: 'demo',
  title: '全球冰封',
  startNodeId: 'start',
  updatedAt: '2026-08-20T00:00:00.000Z',
  assets: [
    { id: 'start-video', fileName: '开场.mp4', objectKey: 'start.mp4', url: '/media/start.mp4', duration: 10, status: 'available' },
    { id: 'end-video', fileName: '结局.mp4', objectKey: 'end.mp4', url: '/media/end.mp4', duration: 8, status: 'available' },
  ],
  nodes: [
    {
      id: 'start', title: '暴雪来临', type: 'normal', scriptText: '', videoAssetId: 'start-video', position: { x: 0, y: 0 },
      choices: [{ id: 'to-end', text: '前往避难所', targetNodeId: 'ending', order: 0 }],
    },
    { id: 'ending', title: '成功获救', type: 'ending', scriptText: '', videoAssetId: 'end-video', position: { x: 0, y: 100 }, choices: [] },
  ],
};

describe('DraftPreview', () => {
  it('automatically advances when there is only one downstream node', () => {
    render(<DraftPreview draft={draft} />);

    expect(screen.getByRole('heading', { name: '暴雪来临' })).toBeInTheDocument();
    expect(screen.getByLabelText('剧情视频').getAttribute('src')).toBe('/media/start.mp4');
    expect(screen.queryByRole('button', { name: '前往避难所' })).not.toBeInTheDocument();

    fireEvent.ended(screen.getByLabelText('剧情视频'));

    expect(screen.getByRole('heading', { name: '成功获救' })).toBeInTheDocument();
    expect(screen.getByLabelText('剧情视频').getAttribute('src')).toBe('/media/end.mp4');
    expect(screen.queryByRole('button', { name: '前往避难所' })).not.toBeInTheDocument();
  });

  it('can reset progress to the start node', async () => {
    const user = userEvent.setup();
    render(<DraftPreview draft={draft} />);
    fireEvent.ended(screen.getByLabelText('剧情视频'));

    await user.click(screen.getByRole('button', { name: '重新开始' }));

    expect(screen.getByRole('heading', { name: '暴雪来临' })).toBeInTheDocument();
  });

  it('shows script-only nodes and advances with an explicit continue action', async () => {
    const user = userEvent.setup();
    const textDraft: ProjectDraft = {
      ...draft,
      assets: [],
      nodes: [
        {
          ...draft.nodes[0]!,
          scriptText: '第一段。\n\n第二段。',
          videoAssetId: null,
        },
        {
          ...draft.nodes[1]!,
          scriptText: '救援队终于抵达。',
          videoAssetId: null,
        },
      ],
    };

    render(<DraftPreview draft={textDraft} />);

    expect(screen.queryByLabelText('剧情视频')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '剧情剧本' }))
      .toHaveTextContent('第一段。 第二段。');

    await user.click(screen.getByRole('button', { name: /继\s*续/ }));

    expect(screen.getByRole('heading', { name: '成功获救' })).toBeInTheDocument();
    expect(screen.getByText('救援队终于抵达。')).toBeInTheDocument();
    expect(screen.getByText('已到达结局')).toBeInTheDocument();
  });

  it('shows ordered choices directly on a branching script node', () => {
    const branchingDraft: ProjectDraft = {
      ...draft,
      assets: [],
      nodes: [
        {
          ...draft.nodes[0]!,
          choicePrompt: '要不要开门救她',
          scriptText: '必须立刻做出选择。',
          videoAssetId: null,
          choices: [
            { id: 'stay', text: '留在原地', targetNodeId: 'ending', order: 1 },
            { id: 'leave', text: '立刻出发', targetNodeId: 'other-ending', order: 0 },
          ],
        },
        { ...draft.nodes[1]!, scriptText: '获救。', videoAssetId: null },
        { ...draft.nodes[1]!, id: 'other-ending', title: '另一结局', scriptText: '继续赶路。', videoAssetId: null },
      ],
    };

    render(<DraftPreview draft={branchingDraft} />);

    expect(screen.getByText('要不要开门救她')).toBeInTheDocument();
    const choices = screen.getAllByRole('button', { name: /立刻出发|留在原地/ });
    expect(choices.map((choice) => choice.textContent)).toEqual(['立刻出发', '留在原地']);
    expect(screen.queryByRole('button', { name: /继\s*续/ })).not.toBeInTheDocument();
  });

  it('shows the custom prompt when a branching video ends', () => {
    const branchingDraft: ProjectDraft = {
      ...draft,
      nodes: [
        {
          ...draft.nodes[0]!,
          choicePrompt: '接下来怎么办？',
          choices: [
            { id: 'stay', text: '留在原地', targetNodeId: 'ending', order: 0 },
            { id: 'leave', text: '立刻出发', targetNodeId: 'other-ending', order: 1 },
          ],
        },
        draft.nodes[1]!,
        { ...draft.nodes[1]!, id: 'other-ending', title: '另一结局' },
      ],
    };

    render(<DraftPreview draft={branchingDraft} />);
    fireEvent.ended(screen.getByLabelText('剧情视频'));

    expect(screen.getByText('接下来怎么办？')).toBeInTheDocument();
  });
});
