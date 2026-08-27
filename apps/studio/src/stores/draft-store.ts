import {
  wouldCreateCycle,
  type Asset,
  type Choice,
  type NodePosition,
  type ProjectDraft,
  type StoryNode,
} from '@interactive-drama/domain';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { api } from '../api/client.js';
import { STORY_LAYER_GAP, STORY_ROW_GAP } from '../constants/story-layout.js';

export type DraftApi = Pick<typeof api, 'getDraft' | 'saveDraft'>;
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type NodePatch = Partial<Omit<StoryNode, 'id'>>;
type CanvasSnapshot = Pick<DraftState, 'draft' | 'selectedNodeId' | 'selectedChoiceId'>;

export type DraftState = {
  draft: ProjectDraft | null;
  selectedNodeId: string | null;
  selectedChoiceId: string | null;
  canUndo: boolean;
  loadStatus: LoadStatus;
  saveStatus: SaveStatus;
  loadDraft: (id: string) => Promise<void>;
  selectNode: (id: string | null) => void;
  selectChoice: (sourceNodeId: string, choiceId: string) => void;
  addNode: (position: NodePosition) => string;
  addBranchNode: (sourceId: string) => string | null;
  updateNode: (id: string, patch: NodePatch) => void;
  applyNodePositions: (positions: ReadonlyMap<string, NodePosition>) => void;
  deleteChoice: (sourceNodeId: string, choiceId: string) => void;
  deleteNode: (id: string) => void;
  connectNodes: (sourceId: string, targetId: string) => boolean;
  setStartNode: (id: string) => void;
  addAsset: (asset: Asset) => void;
  removeAsset: (id: string) => void;
  undoCanvas: () => boolean;
  saveNow: () => Promise<void>;
};

export type DraftStore = StoreApi<DraftState>;

export function createDraftStore(
  client: DraftApi = api,
  autosaveDelay = 800,
): DraftStore {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let canvasHistory: CanvasSnapshot[] = [];

  return createStore<DraftState>((set, get) => {
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void get().saveNow(), autosaveDelay);
    }

    function updateDraft(
      update: (draft: ProjectDraft) => ProjectDraft,
      canvasChange = false,
    ) {
      const draft = get().draft;
      if (!draft) return;
      if (canvasChange) {
        canvasHistory.push({
          draft: structuredClone(draft),
          selectedNodeId: get().selectedNodeId,
          selectedChoiceId: get().selectedChoiceId,
        });
      }
      set({
        draft: update(draft),
        canUndo: canvasHistory.length > 0,
        saveStatus: 'saving',
      });
      scheduleSave();
    }

    return {
      draft: null,
      selectedNodeId: null,
      selectedChoiceId: null,
      canUndo: false,
      loadStatus: 'idle',
      saveStatus: 'idle',

      async loadDraft(id) {
        canvasHistory = [];
        set({ loadStatus: 'loading' });
        try {
          const draft = await client.getDraft(id);
          set({
            draft,
            selectedNodeId: null,
            selectedChoiceId: null,
            canUndo: false,
            loadStatus: 'ready',
            saveStatus: 'saved',
          });
        } catch {
          set({ loadStatus: 'error' });
        }
      },

      selectNode(id) {
        set({ selectedNodeId: id, selectedChoiceId: null });
      },

      selectChoice(sourceNodeId, choiceId) {
        set({ selectedNodeId: sourceNodeId, selectedChoiceId: choiceId });
      },

      addNode(position) {
        const id = crypto.randomUUID();
        updateDraft((draft) => {
          const node: StoryNode = {
            id,
            title: `剧情节点 ${draft.nodes.length + 1}`,
            type: 'normal',
            scriptText: '',
            videoAssetId: null,
            position,
            choices: [],
          };
          return {
            ...draft,
            startNodeId: draft.startNodeId ?? id,
            nodes: [...draft.nodes, node],
          };
        }, true);
        set({ selectedNodeId: id, selectedChoiceId: null });
        return id;
      },

      addBranchNode(sourceId) {
        const draft = get().draft;
        const source = draft?.nodes.find((node) => node.id === sourceId);
        if (!draft || !source || source.type === 'ending') return null;

        const id = crypto.randomUUID();
        const choice: Choice = {
          id: crypto.randomUUID(),
          text: `分支 ${source.choices.length + 1}`,
          targetNodeId: id,
          order: source.choices.length,
        };
        const targetX = source.position.x + STORY_LAYER_GAP;
        const siblingNodes = source.choices
          .map((item) => draft.nodes.find((candidate) => candidate.id === item.targetNodeId))
          .filter((candidate): candidate is StoryNode => Boolean(candidate));
        const targetY = siblingNodes.length > 0
          ? Math.max(...siblingNodes.map((sibling) => sibling.position.y)) + STORY_ROW_GAP
          : source.position.y;
        const targetRowOccupied = draft.nodes.some(
          (item) => item.position.x === targetX && item.position.y === targetY,
        );
        const node: StoryNode = {
          id,
          title: `剧情节点 ${draft.nodes.length + 1}`,
          type: 'normal',
          scriptText: '',
          videoAssetId: null,
          position: {
            x: targetX,
            y: targetY,
          },
          choices: [],
        };

        updateDraft((current) => ({
          ...current,
          nodes: [
            ...current.nodes.map((item) => {
              const shiftedItem = targetRowOccupied && item.position.y >= targetY
                ? {
                    ...item,
                    position: { ...item.position, y: item.position.y + STORY_ROW_GAP },
                  }
                : item;
              return shiftedItem.id === sourceId
                ? { ...shiftedItem, choices: [...shiftedItem.choices, choice] }
                : shiftedItem;
            }),
            node,
          ],
        }), true);
        set({ selectedNodeId: id, selectedChoiceId: null });
        return id;
      },

      updateNode(id, patch) {
        updateDraft((draft) => ({
          ...draft,
          nodes: draft.nodes.map((node) =>
            node.id === id ? ({ ...node, ...patch } as StoryNode) : node,
          ),
        }), patch.choices !== undefined);
      },

      applyNodePositions(positions) {
        updateDraft((draft) => ({
          ...draft,
          nodes: draft.nodes.map((node) => ({
            ...node,
            position: positions.get(node.id) ?? node.position,
          })),
        }), true);
      },

      deleteChoice(sourceNodeId, choiceId) {
        updateDraft((draft) => ({
          ...draft,
          nodes: draft.nodes.map((node) => node.id === sourceNodeId
            ? {
                ...node,
                choices: node.choices
                  .filter((choice) => choice.id !== choiceId)
                  .map((choice, order) => ({ ...choice, order })),
              }
            : node),
        }), true);
        if (get().selectedChoiceId === choiceId) {
          set({ selectedNodeId: null, selectedChoiceId: null });
        }
      },

      deleteNode(id) {
        updateDraft((draft) => ({
          ...draft,
          startNodeId: draft.startNodeId === id ? null : draft.startNodeId,
          nodes: draft.nodes
            .filter((node) => node.id !== id)
            .map((node) => ({
              ...node,
              choices: node.choices.filter((choice) => choice.targetNodeId !== id),
            })),
        }), true);
        if (get().selectedNodeId === id) {
          set({ selectedNodeId: null, selectedChoiceId: null });
        }
      },

      connectNodes(sourceId, targetId) {
        const draft = get().draft;
        const source = draft?.nodes.find((node) => node.id === sourceId);
        if (
          !draft ||
          !source ||
          source.type === 'ending' ||
          !draft.nodes.some((node) => node.id === targetId) ||
          wouldCreateCycle(draft.nodes, sourceId, targetId)
        ) {
          return false;
        }
        const choice: Choice = {
          id: crypto.randomUUID(),
          text: `分支 ${source.choices.length + 1}`,
          targetNodeId: targetId,
          order: source.choices.length,
        };
        get().updateNode(sourceId, { choices: [...source.choices, choice] });
        return true;
      },

      setStartNode(id) {
        updateDraft((draft) => ({ ...draft, startNodeId: id }));
      },

      addAsset(asset) {
        updateDraft((draft) => ({
          ...draft,
          assets: draft.assets.some((item) => item.id === asset.id)
            ? draft.assets
            : [...draft.assets, asset],
        }));
      },

      removeAsset(id) {
        updateDraft((draft) => ({
          ...draft,
          assets: draft.assets.filter((asset) => asset.id !== id),
        }));
      },

      undoCanvas() {
        const snapshot = canvasHistory.pop();
        if (!snapshot?.draft) return false;
        set({
          draft: structuredClone(snapshot.draft),
          selectedNodeId: snapshot.selectedNodeId,
          selectedChoiceId: snapshot.selectedChoiceId,
          canUndo: canvasHistory.length > 0,
          saveStatus: 'saving',
        });
        scheduleSave();
        return true;
      },

      async saveNow() {
        if (saveTimer) {
          clearTimeout(saveTimer);
          saveTimer = null;
        }
        const draft = get().draft;
        if (!draft) return;
        set({ saveStatus: 'saving' });
        try {
          const savedDraft = await client.saveDraft(draft);
          set({ draft: savedDraft, saveStatus: 'saved' });
        } catch {
          set({ saveStatus: 'error' });
        }
      },
    };
  });
}

export const draftStore = createDraftStore();
