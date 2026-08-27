import type { PublishedManifest } from '@interactive-drama/domain';

export type PlayerHistoryEntry = {
  sourceNodeId: string;
  choiceId: string;
  targetNodeId: string;
};

export type PlayerProgress = {
  currentNodeId: string;
  unlockedNodeIds: string[];
  exploredChoiceIds: string[];
  history: PlayerHistoryEntry[];
};

export function progressKey(manifest: PublishedManifest): string {
  return `interactive-drama:progress:${manifest.projectId}:${manifest.version}`;
}

export function createInitialProgress(manifest: PublishedManifest): PlayerProgress {
  return {
    currentNodeId: manifest.startNodeId,
    unlockedNodeIds: [manifest.startNodeId],
    exploredChoiceIds: [],
    history: [],
  };
}

export function chooseBranch(
  progress: PlayerProgress,
  sourceNodeId: string,
  choiceId: string,
  targetNodeId: string,
): PlayerProgress {
  return {
    currentNodeId: targetNodeId,
    unlockedNodeIds: [...new Set([...progress.unlockedNodeIds, targetNodeId])],
    exploredChoiceIds: [...new Set([...progress.exploredChoiceIds, choiceId])],
    history: [...progress.history, { sourceNodeId, choiceId, targetNodeId }],
  };
}

export function revisitNode(
  progress: PlayerProgress,
  nodeId: string,
): PlayerProgress {
  return { ...progress, currentNodeId: nodeId };
}

export function restartStory(
  progress: PlayerProgress,
  startNodeId: string,
): PlayerProgress {
  return { ...progress, currentNodeId: startNodeId };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isHistory(value: unknown): value is PlayerHistoryEntry[] {
  return Array.isArray(value) && value.every((item) => (
    typeof item === 'object' && item !== null &&
    typeof (item as PlayerHistoryEntry).sourceNodeId === 'string' &&
    typeof (item as PlayerHistoryEntry).choiceId === 'string' &&
    typeof (item as PlayerHistoryEntry).targetNodeId === 'string'
  ));
}

export function loadProgress(
  storage: Pick<Storage, 'getItem'>,
  manifest: PublishedManifest,
): PlayerProgress {
  const initial = createInitialProgress(manifest);
  try {
    const serialized = storage.getItem(progressKey(manifest));
    if (!serialized) return initial;
    const saved = JSON.parse(serialized) as Partial<PlayerProgress>;
    if (
      typeof saved.currentNodeId !== 'string' ||
      !isStringArray(saved.unlockedNodeIds) ||
      !isStringArray(saved.exploredChoiceIds) ||
      !isHistory(saved.history)
    ) {
      return initial;
    }

    const nodeIds = new Set(manifest.nodes.map((node) => node.id));
    const choices = new Map(manifest.nodes.flatMap((node) =>
      node.choices.map((choice) => [choice.id, {
        sourceNodeId: node.id,
        targetNodeId: choice.targetNodeId,
      }] as const),
    ));
    const unlockedNodeIds = [...new Set([
      manifest.startNodeId,
      ...saved.unlockedNodeIds.filter((id) => nodeIds.has(id)),
    ])];
    const exploredChoiceIds = [...new Set(
      saved.exploredChoiceIds.filter((id) => choices.has(id)),
    )];
    const history = saved.history.filter((entry) => {
      const choice = choices.get(entry.choiceId);
      return choice?.sourceNodeId === entry.sourceNodeId &&
        choice.targetNodeId === entry.targetNodeId &&
        nodeIds.has(entry.sourceNodeId) && nodeIds.has(entry.targetNodeId);
    });

    return {
      currentNodeId: nodeIds.has(saved.currentNodeId)
        ? saved.currentNodeId
        : manifest.startNodeId,
      unlockedNodeIds,
      exploredChoiceIds,
      history,
    };
  } catch {
    return initial;
  }
}

export function saveProgress(
  storage: Pick<Storage, 'setItem'>,
  manifest: PublishedManifest,
  progress: PlayerProgress,
): void {
  try {
    storage.setItem(progressKey(manifest), JSON.stringify(progress));
  } catch {
    // Playback must remain available when browser storage is blocked.
  }
}
