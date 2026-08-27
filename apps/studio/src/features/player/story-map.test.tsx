import type { PublishedManifest } from '@interactive-drama/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PlayerProgress } from './player-progress.js';
import { projectVisibleStory, StoryMap } from './story-map.js';

const manifest: PublishedManifest = {
  projectId: 'ice-world',
  title: '全球冰封',
  version: 'v1',
  startNodeId: 'start',
  nodes: [
    {
      id: 'start', title: '开场', type: 'normal', videoUrl: '/start.mp4',
      choices: [
        { id: 'go-left', text: '留守', targetNodeId: 'left', order: 0 },
        { id: 'go-right', text: '外出', targetNodeId: 'right', order: 1 },
      ],
    },
    {
      id: 'left', title: '左线', type: 'normal', videoUrl: '/left.mp4',
      choices: [{ id: 'left-end', text: '等待', targetNodeId: 'ending', order: 0 }],
    },
    { id: 'right', title: '右线', type: 'ending', videoUrl: '/right.mp4', choices: [] },
    { id: 'ending', title: '结局', type: 'ending', videoUrl: '/ending.mp4', choices: [] },
  ],
};

const progress: PlayerProgress = {
  currentNodeId: 'start',
  unlockedNodeIds: ['start', 'left'],
  exploredChoiceIds: ['go-left'],
  history: [
    { sourceNodeId: 'start', choiceId: 'go-left', targetNodeId: 'left' },
  ],
};

describe('story map', () => {
  it('shows unlocked stories and only redacted immediate unknown targets', () => {
    const projected = projectVisibleStory(manifest, progress);

    expect(projected.nodes).toEqual([
      expect.objectContaining({ id: 'start', title: '开场', locked: false, depth: 0 }),
      expect.objectContaining({ id: 'left', title: '左线', locked: false, depth: 1 }),
      expect.objectContaining({ id: 'right', title: '未解锁', locked: true, depth: 1 }),
      expect.objectContaining({ id: 'ending', title: '未解锁', locked: true, depth: 2 }),
    ]);
    expect(projected.edges).toEqual([
      expect.objectContaining({ id: 'go-left', label: '留守', locked: false }),
      expect.objectContaining({ id: 'go-right', label: '未知分支', locked: true }),
      expect.objectContaining({ id: 'left-end', label: '', locked: true }),
    ]);
    expect(JSON.stringify(projected)).not.toContain('videoUrl');
  });

  it('confirms before revisiting an unlocked story and ignores locked stories', async () => {
    const user = userEvent.setup();
    const onRevisit = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <StoryMap
        manifest={manifest}
        progress={progress}
        onRevisit={onRevisit}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('当前剧情')).toBeInTheDocument();
    const lockedNode = container.querySelector<HTMLButtonElement>('.story-map-node.is-locked');
    expect(lockedNode).not.toBeNull();
    fireEvent.click(lockedNode!);
    expect(screen.queryByText(/将从/)).not.toBeInTheDocument();

    const unlockedNode = container.querySelector<HTMLButtonElement>(
      '.story-map-node:not(.is-current):not(.is-locked)',
    );
    expect(unlockedNode).not.toBeNull();
    fireEvent.click(unlockedNode!);
    expect(screen.getByText('将从“左线”重新播放，已解锁剧情不会丢失'))
      .toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onRevisit).not.toHaveBeenCalled();

    fireEvent.click(unlockedNode!);
    await user.click(screen.getByRole('button', { name: '确认回溯' }));
    expect(onRevisit).toHaveBeenCalledOnce();
    expect(onRevisit).toHaveBeenCalledWith('left');

    await user.click(screen.getByRole('button', { name: '关闭剧情图谱' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
