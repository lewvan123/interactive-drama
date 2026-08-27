import { validateDraft } from './graph-validation.js';
import type { ProjectDraft, PublishedManifest } from './types.js';

export function buildPublishedManifest(
  draft: ProjectDraft,
  version: string,
): PublishedManifest {
  if (validateDraft(draft).length > 0 || draft.startNodeId === null) {
    throw new Error('剧情草稿未通过发布检查');
  }

  const assetsById = new Map(draft.assets.map((asset) => [asset.id, asset]));

  return {
    projectId: draft.id,
    title: draft.title,
    version,
    startNodeId: draft.startNodeId,
    nodes: draft.nodes.map((node) => {
      const asset = node.videoAssetId
        ? assetsById.get(node.videoAssetId)
        : undefined;
      const choicePrompt = node.choicePrompt?.trim();

      return {
        id: node.id,
        title: node.title,
        ...(choicePrompt ? { choicePrompt } : {}),
        type: node.type,
        ...(asset
          ? { videoUrl: asset.url }
          : { scriptText: node.scriptText.trim() }),
        choices: [...node.choices].sort((left, right) => left.order - right.order),
      };
    }),
  };
}
