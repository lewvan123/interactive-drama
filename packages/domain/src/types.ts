export type NodePosition = {
  x: number;
  y: number;
};

export type Choice = {
  id: string;
  text: string;
  targetNodeId: string;
  order: number;
};

type StoryNodeBase = {
  id: string;
  title: string;
  choicePrompt?: string | undefined;
  scriptText: string;
  videoAssetId: string | null;
  position: NodePosition;
  choices: Choice[];
};

export type NormalStoryNode = StoryNodeBase & {
  type: 'normal';
};

export type EndingStoryNode = StoryNodeBase & {
  type: 'ending';
};

export type StoryNode = NormalStoryNode | EndingStoryNode;

export type AssetStatus = 'uploading' | 'available' | 'failed';

export type Asset = {
  id: string;
  fileName: string;
  objectKey: string;
  url: string;
  duration: number;
  status: AssetStatus;
};

export type ProjectDraft = {
  id: string;
  title: string;
  startNodeId: string | null;
  nodes: StoryNode[];
  assets: Asset[];
  updatedAt: string;
};

export type ValidationIssueCode =
  | 'START_MISSING'
  | 'START_INVALID'
  | 'TARGET_MISSING'
  | 'CHOICE_MISSING'
  | 'ENDING_HAS_CHOICE'
  | 'GRAPH_CYCLE'
  | 'NODE_UNREACHABLE'
  | 'VIDEO_MISSING'
  | 'CONTENT_MISSING';

export type ValidationIssue = {
  code: ValidationIssueCode;
  nodeId?: string;
  message: string;
};

export type PublishedChoice = Choice;

export type PublishedNode = {
  id: string;
  title: string;
  choicePrompt?: string | undefined;
  type: StoryNode['type'];
  videoUrl?: string;
  scriptText?: string;
  choices: PublishedChoice[];
};

export type PublishedManifest = {
  projectId: string;
  title: string;
  version: string;
  startNodeId: string;
  nodes: PublishedNode[];
};
