import type { PublishedManifest } from '@interactive-drama/domain';
import { describe, expect, it, vi } from 'vitest';

import {
  chooseBranch,
  createInitialProgress,
  loadProgress,
  progressKey,
  restartStory,
  revisitNode,
  saveProgress,
} from './player-progress.js';

const manifest: PublishedManifest = {
  projectId: 'ice-world',
  title: '全球冰封',
  version: 'v1',
  startNodeId: 'start',
  nodes: [
    {
      id: 'start', title: '开场', type: 'normal', videoUrl: '/start.mp4',
      choices: [
        { id: 'go-left', text: '向左', targetNodeId: 'left', order: 0 },
        { id: 'go-right', text: '向右', targetNodeId: 'right', order: 1 },
      ],
    },
    { id: 'left', title: '左线', type: 'ending', videoUrl: '/left.mp4', choices: [] },
    { id: 'right', title: '右线', type: 'ending', videoUrl: '/right.mp4', choices: [] },
  ],
};

describe('player progress', () => {
  it('starts from the first node and records discovered branches in order', () => {
    const initial = createInitialProgress(manifest);

    expect(initial).toEqual({
      currentNodeId: 'start',
      unlockedNodeIds: ['start'],
      exploredChoiceIds: [],
      history: [],
    });
    expect(chooseBranch(initial, 'start', 'go-left', 'left')).toEqual({
      currentNodeId: 'left',
      unlockedNodeIds: ['start', 'left'],
      exploredChoiceIds: ['go-left'],
      history: [{ sourceNodeId: 'start', choiceId: 'go-left', targetNodeId: 'left' }],
    });
  });

  it('keeps discoveries when revisiting or restarting', () => {
    const explored = chooseBranch(
      createInitialProgress(manifest),
      'start',
      'go-left',
      'left',
    );

    expect(revisitNode(explored, 'start')).toEqual({
      ...explored,
      currentNodeId: 'start',
    });
    expect(restartStory(explored, 'start')).toEqual({
      ...explored,
      currentNodeId: 'start',
    });
  });

  it('stores progress under a project and release-specific key', () => {
    expect(progressKey(manifest)).toBe('interactive-drama:progress:ice-world:v1');
    expect(progressKey({ ...manifest, version: 'v2' }))
      .toBe('interactive-drama:progress:ice-world:v2');
  });

  it('loads only IDs that still exist in the current manifest', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify({
        currentNodeId: 'removed',
        unlockedNodeIds: ['start', 'left', 'removed'],
        exploredChoiceIds: ['go-left', 'removed-choice'],
        history: [
          { sourceNodeId: 'start', choiceId: 'go-left', targetNodeId: 'left' },
          { sourceNodeId: 'start', choiceId: 'removed-choice', targetNodeId: 'removed' },
        ],
      })),
    };

    expect(loadProgress(storage, manifest)).toEqual({
      currentNodeId: 'start',
      unlockedNodeIds: ['start', 'left'],
      exploredChoiceIds: ['go-left'],
      history: [{ sourceNodeId: 'start', choiceId: 'go-left', targetNodeId: 'left' }],
    });
    expect(storage.getItem).toHaveBeenCalledWith(
      'interactive-drama:progress:ice-world:v1',
    );
  });

  it('falls back to initial progress for malformed saved data', () => {
    const malformed = { getItem: vi.fn().mockReturnValue('{broken') };
    const wrongShape = { getItem: vi.fn().mockReturnValue(JSON.stringify({ currentNodeId: 1 })) };

    expect(loadProgress(malformed, manifest)).toEqual(createInitialProgress(manifest));
    expect(loadProgress(wrongShape, manifest)).toEqual(createInitialProgress(manifest));
  });

  it('does not leak v1 progress into v2', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const v1Progress = chooseBranch(
      createInitialProgress(manifest),
      'start',
      'go-left',
      'left',
    );
    saveProgress(storage, manifest, v1Progress);

    expect(loadProgress(storage, { ...manifest, version: 'v2' }))
      .toEqual(createInitialProgress({ ...manifest, version: 'v2' }));
  });

  it('does not interrupt playback when storage access is unavailable', () => {
    const readFailure = { getItem: vi.fn(() => { throw new Error('blocked'); }) };
    const writeFailure = { setItem: vi.fn(() => { throw new Error('blocked'); }) };

    expect(loadProgress(readFailure, manifest)).toEqual(createInitialProgress(manifest));
    expect(() => saveProgress(
      writeFailure,
      manifest,
      createInitialProgress(manifest),
    )).not.toThrow();
  });
});
