import { z } from 'zod';

export const ChoiceSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  targetNodeId: z.string().min(1),
  order: z.number().int().nonnegative(),
});

const StoryNodeBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  choicePrompt: z.string().optional(),
  scriptText: z.string(),
  videoAssetId: z.string().min(1).nullable(),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  choices: z.array(ChoiceSchema),
});

export const StoryNodeSchema = z.discriminatedUnion('type', [
  StoryNodeBaseSchema.extend({ type: z.literal('normal') }),
  StoryNodeBaseSchema.extend({ type: z.literal('ending') }),
]);

export const AssetSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  objectKey: z.string().min(1),
  url: z.string().min(1),
  duration: z.number().nonnegative(),
  status: z.enum(['uploading', 'available', 'failed']),
});

export const ProjectDraftSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  startNodeId: z.string().min(1).nullable(),
  nodes: z.array(StoryNodeSchema),
  assets: z.array(AssetSchema),
  updatedAt: z.iso.datetime(),
});
