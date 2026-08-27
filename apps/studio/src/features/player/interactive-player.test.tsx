import type { PublishedManifest } from '@interactive-drama/domain';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { progressKey, type PlayerProgress } from './player-progress.js';
import { InteractivePlayer } from './interactive-player.js';

const manifest: PublishedManifest = {
  projectId: 'ice-world',
  title: '全球冰封',
  version: 'v1',
  startNodeId: 'start',
  nodes: [
    {
      id: 'start', title: '灾变前夜', type: 'normal', videoUrl: '/start.mp4',
      choices: [
        { id: 'stay-home', text: '留在家中', targetNodeId: 'left', order: 0 },
        { id: 'find-food', text: '寻找物资', targetNodeId: 'right', order: 1 },
      ],
    },
    {
      id: 'left', title: '固守家园', type: 'normal', videoUrl: '/left.mp4',
      choices: [
        { id: 'wait-rescue', text: '等待救援', targetNodeId: 'ending', order: 0 },
      ],
    },
    { id: 'right', title: '雪夜迷途', type: 'ending', videoUrl: '/right.mp4', choices: [] },
    { id: 'ending', title: '黎明将至', type: 'ending', videoUrl: '/ending.mp4', choices: [] },
  ],
};

const textToVideoManifest: PublishedManifest = {
  projectId: 'text-to-video',
  title: '冰封剧本',
  version: 'v1',
  startNodeId: 'text-start',
  nodes: [
    {
      id: 'text-start', title: '寒潮预警', type: 'normal',
      scriptText: '冰层正在蔓延。\n\n必须立刻寻找避难所。',
      choices: [{ id: 'continue', text: '前往避难所', targetNodeId: 'video-end', order: 0 }],
    },
    {
      id: 'video-end', title: '抵达避难所', type: 'ending',
      videoUrl: '/shelter.mp4', choices: [],
    },
  ],
};

function createStorage(saved?: PlayerProgress) {
  const values = new Map<string, string>();
  if (saved) values.set(progressKey(manifest), JSON.stringify(saved));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    read: () => JSON.parse(values.get(progressKey(manifest)) ?? 'null') as PlayerProgress | null,
  };
}

function video() {
  return screen.getByLabelText<HTMLVideoElement>('剧情视频');
}

describe('interactive player', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('starts the saved story only after the first play request resolves', async () => {
    let resolvePlay!: () => void;
    const playResult = new Promise<void>((resolve) => { resolvePlay = resolve; });
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockReturnValueOnce(playResult);
    const user = userEvent.setup();

    render(<InteractivePlayer manifest={manifest} storage={createStorage()} />);

    expect(screen.getByRole('heading', { name: '全球冰封' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始体验' })).toBeInTheDocument();
    expect(video()).toHaveAttribute('src', '/start.mp4');

    await user.click(screen.getByRole('button', { name: '开始体验' }));
    expect(screen.getByRole('button', { name: '开始体验' })).toBeInTheDocument();
    resolvePlay();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '开始体验' })).not.toBeInTheDocument();
    });
    expect(play).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '暂停' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '静音' })).not.toBeInTheDocument();
  });

  it('toggles pause and playback when the video surface is tapped', async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={manifest} storage={createStorage()} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    await user.click(video());
    expect(pause).toHaveBeenCalledOnce();

    await user.click(video());
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('starts a script-only story in reading mode without playing media', async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={textToVideoManifest} storage={createStorage()} />);

    expect(screen.getByRole('button', { name: '开始体验' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    expect(screen.getByRole('region', { name: '剧情剧本' }))
      .toHaveTextContent('冰层正在蔓延。 必须立刻寻找避难所。');
    expect(screen.queryByLabelText('剧情视频')).not.toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();
  });

  it('continues from a script node into a video node', async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={textToVideoManifest} storage={createStorage()} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    await user.click(screen.getByRole('button', { name: '继续' }));

    expect(screen.getByLabelText('剧情视频')).toHaveAttribute('src', '/shelter.mp4');
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
  });

  it('resets the script scroll position when continuing to the next text node', async () => {
    const textToTextManifest: PublishedManifest = {
      ...textToVideoManifest,
      projectId: 'text-to-text',
      nodes: [
        {
          id: 'text-start', title: '第一章', type: 'normal', scriptText: '第一段长剧本。',
          choices: [{ id: 'continue', text: '', targetNodeId: 'text-end', order: 0 }],
        },
        {
          id: 'text-end', title: '第二章', type: 'ending', scriptText: '第二段长剧本。',
          choices: [],
        },
      ],
    };
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={textToTextManifest} storage={createStorage()} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    const firstScriptBody = screen.getByRole('region', { name: '剧情剧本' })
      .querySelector<HTMLElement>('.interactive-player__script-body');
    expect(firstScriptBody).not.toBeNull();
    firstScriptBody!.scrollTop = 240;

    await user.click(screen.getByRole('button', { name: '继续' }));

    const nextScriptBody = screen.getByRole('region', { name: '剧情剧本' })
      .querySelector<HTMLElement>('.interactive-player__script-body');
    expect(nextScriptBody).toHaveTextContent('第二段长剧本。');
    expect(nextScriptBody).toHaveProperty('scrollTop', 0);
  });

  it('moves from a video node into a script ending', async () => {
    const mixedManifest: PublishedManifest = {
      ...textToVideoManifest,
      projectId: 'video-to-text',
      startNodeId: 'video-start',
      nodes: [
        {
          id: 'video-start', title: '出发', type: 'normal', videoUrl: '/start.mp4',
          choices: [{ id: 'to-text', text: '继续', targetNodeId: 'text-end', order: 0 }],
        },
        {
          id: 'text-end', title: '文字结局', type: 'ending', scriptText: '所有人平安获救。',
          choices: [],
        },
      ],
    };
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={mixedManifest} storage={createStorage()} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    fireEvent.ended(video());

    expect(screen.getByRole('region', { name: '剧情剧本' })).toHaveTextContent('所有人平安获救。');
    expect(screen.getByText('已到达结局')).toBeInTheDocument();
  });

  it('shows ordered choices on a branching script node', async () => {
    const branchingManifest: PublishedManifest = {
      ...textToVideoManifest,
      nodes: [
        {
          ...textToVideoManifest.nodes[0]!,
          choicePrompt: '要不要立刻出发',
          choices: [
            { id: 'stay', text: '留在原地', targetNodeId: 'video-end', order: 1 },
            { id: 'leave', text: '立刻出发', targetNodeId: 'text-end', order: 0 },
          ],
        },
        textToVideoManifest.nodes[1]!,
        { id: 'text-end', title: '另一结局', type: 'ending', scriptText: '黎明到来。', choices: [] },
      ],
    };
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={branchingManifest} storage={createStorage()} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    expect(screen.getByText('要不要立刻出发')).toBeInTheDocument();
    const choices = screen.getAllByRole('button', { name: /立刻出发|留在原地/ });
    expect(choices.map((choice) => choice.textContent)).toEqual(['立刻出发', '留在原地']);
  });

  it('shows the custom prompt after a branching video ends', async () => {
    const customPromptManifest: PublishedManifest = {
      ...manifest,
      nodes: manifest.nodes.map((node, index) => (
        index === 0 ? { ...node, choicePrompt: '要不要开门救她' } : node
      )),
    };
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={customPromptManifest} storage={createStorage()} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    fireEvent.ended(video());

    expect(screen.getByText('要不要开门救她')).toBeInTheDocument();
  });

  it('keeps video playback primary when a node also contains script text', async () => {
    const mixedContentManifest: PublishedManifest = {
      ...manifest,
      nodes: manifest.nodes.map((node, index) => (
        index === 0 ? { ...node, scriptText: '不应展示的剧本' } : node
      )),
    };
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={mixedContentManifest} storage={createStorage()} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    expect(video()).toHaveAttribute('src', '/start.mp4');
    expect(screen.queryByRole('region', { name: '剧情剧本' })).not.toBeInTheDocument();
  });

  it('shows ordered choices only after the video ends and persists the selected branch', async () => {
    const storage = createStorage();
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={manifest} storage={storage} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    expect(screen.queryByRole('button', { name: '留在家中' })).not.toBeInTheDocument();
    fireEvent.ended(video());
    const choices = screen.getAllByRole('button', { name: /留在家中|寻找物资/ });
    expect(choices.map((choice) => choice.textContent)).toEqual(['留在家中', '寻找物资']);

    await user.click(screen.getByRole('button', { name: '留在家中' }));
    expect(video()).toHaveAttribute('src', '/left.mp4');
    expect(storage.read()).toMatchObject({
      currentNodeId: 'left',
      unlockedNodeIds: ['start', 'left'],
      exploredChoiceIds: ['stay-home'],
    });
  });

  it('does not show the start screen while the next node video is loading', async () => {
    let resolveNextPlay!: () => void;
    const nextPlay = new Promise<void>((resolve) => { resolveNextPlay = resolve; });
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockResolvedValueOnce(undefined).mockReturnValueOnce(nextPlay);
    const user = userEvent.setup();

    render(<InteractivePlayer manifest={manifest} storage={createStorage()} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));
    fireEvent.ended(video());
    await user.click(screen.getByRole('button', { name: '留在家中' }));

    expect(video()).toHaveAttribute('src', '/left.mp4');
    expect(screen.queryByRole('button', { name: '开始体验' })).not.toBeInTheDocument();

    resolveNextPlay();
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  });

  it('automatically continues when a story node has only one downstream node', async () => {
    const storage = createStorage({
      currentNodeId: 'left',
      unlockedNodeIds: ['start', 'left'],
      exploredChoiceIds: ['stay-home'],
      history: [{ sourceNodeId: 'start', choiceId: 'stay-home', targetNodeId: 'left' }],
    });
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={manifest} storage={storage} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    fireEvent.ended(video());

    expect(screen.queryByText('你会怎么选？')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '等待救援' })).not.toBeInTheDocument();
    expect(video()).toHaveAttribute('src', '/ending.mp4');
    expect(storage.read()).toMatchObject({
      currentNodeId: 'ending',
      unlockedNodeIds: ['start', 'left', 'ending'],
      exploredChoiceIds: ['stay-home', 'wait-rescue'],
    });
  });

  it('opens the story map and revisits an unlocked node without losing discoveries', async () => {
    const storage = createStorage({
      currentNodeId: 'left',
      unlockedNodeIds: ['start', 'left'],
      exploredChoiceIds: ['stay-home'],
      history: [{ sourceNodeId: 'start', choiceId: 'stay-home', targetNodeId: 'left' }],
    });
    const user = userEvent.setup();
    const { container } = render(<InteractivePlayer manifest={manifest} storage={storage} />);

    await user.click(screen.getByRole('button', { name: '剧情图谱' }));
    expect(screen.getByRole('region', { name: '剧情图谱' })).toBeInTheDocument();
    const startNode = container.querySelector<HTMLButtonElement>(
      '.story-map-node:not(.is-current):not(.is-locked)',
    );
    expect(startNode).not.toBeNull();
    fireEvent.click(startNode!);
    await user.click(screen.getByRole('button', { name: '确认回溯' }));

    expect(video()).toHaveAttribute('src', '/start.mp4');
    expect(storage.read()).toMatchObject({
      currentNodeId: 'start',
      unlockedNodeIds: ['start', 'left'],
      exploredChoiceIds: ['stay-home'],
    });
    expect(screen.queryByRole('region', { name: '剧情图谱' })).not.toBeInTheDocument();
  });

  it('shows ending progress and restarts without clearing unlocked stories', async () => {
    const storage = createStorage({
      currentNodeId: 'ending',
      unlockedNodeIds: ['start', 'left', 'ending'],
      exploredChoiceIds: ['stay-home', 'wait-rescue'],
      history: [
        { sourceNodeId: 'start', choiceId: 'stay-home', targetNodeId: 'left' },
        { sourceNodeId: 'left', choiceId: 'wait-rescue', targetNodeId: 'ending' },
      ],
    });
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={manifest} storage={storage} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    fireEvent.ended(video());
    expect(screen.getByText('已到达结局')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '黎明将至' })).toBeInTheDocument();
    expect(screen.getByText('已探索 3 / 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看剧情图谱' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重新体验' }));
    expect(video()).toHaveAttribute('src', '/start.mp4');
    expect(storage.read()?.unlockedNodeIds).toEqual(['start', 'left', 'ending']);
  });

  it('offers a retry when the browser blocks the initial play request', async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockRejectedValueOnce(new Error('NotAllowedError')).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={manifest} storage={createStorage()} />);

    await user.click(screen.getByRole('button', { name: '开始体验' }));
    expect(screen.getByText('浏览器阻止了自动播放，请再次点击播放')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '再次播放' }));

    await waitFor(() => expect(screen.queryByText(/浏览器阻止/)).not.toBeInTheDocument());
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('reloads and retries a failed video', async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const load = vi.mocked(HTMLMediaElement.prototype.load);
    const user = userEvent.setup();
    render(<InteractivePlayer manifest={manifest} storage={createStorage()} />);
    await user.click(screen.getByRole('button', { name: '开始体验' }));

    fireEvent.error(video());
    expect(screen.getByText('视频加载失败')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新加载' }));

    expect(load).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledTimes(2);
  });
});
