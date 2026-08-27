import type { ProjectDraft } from '@interactive-drama/domain';

import type { ObjectStore } from '../../storage/object-store.js';

export type ProjectSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

type ProjectIndex = {
  projects: ProjectSummary[];
};

const PROJECT_INDEX_KEY = 'projects/index.json';

export class ProjectRepository {
  constructor(
    private readonly objectStore: ObjectStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async list(): Promise<ProjectSummary[]> {
    const index = await this.objectStore.getJson<ProjectIndex>(PROJECT_INDEX_KEY);
    return [...(index?.projects ?? [])].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  async create(title: string): Promise<{
    project: ProjectSummary;
    draft: ProjectDraft;
  }> {
    const id = this.createId();
    const startNodeId = this.createId();
    const updatedAt = this.now();
    const project = { id, title, updatedAt };
    const draft: ProjectDraft = {
      id,
      title,
      startNodeId,
      nodes: [{
        id: startNodeId,
        title: '剧情节点 1',
        type: 'normal',
        scriptText: '',
        videoAssetId: null,
        position: { x: 0, y: 0 },
        choices: [],
      }],
      assets: [],
      updatedAt,
    };
    const projects = await this.list();

    await this.objectStore.putJson(this.draftKey(id), draft);
    await this.objectStore.putJson(PROJECT_INDEX_KEY, {
      projects: [project, ...projects],
    } satisfies ProjectIndex);

    return { project, draft };
  }

  async getDraft(id: string): Promise<ProjectDraft | null> {
    return this.objectStore.getJson<ProjectDraft>(this.draftKey(id));
  }

  async saveDraft(draft: ProjectDraft): Promise<ProjectDraft> {
    const savedDraft = { ...draft, updatedAt: this.now() };
    const projects = await this.list();
    const existingProject = projects.find((project) => project.id === draft.id);
    if (!existingProject) {
      throw new Error('PROJECT_NOT_FOUND');
    }

    const updatedProject: ProjectSummary = {
      id: draft.id,
      title: draft.title,
      updatedAt: savedDraft.updatedAt,
    };
    await this.objectStore.putJson(this.draftKey(draft.id), savedDraft);
    await this.objectStore.putJson(PROJECT_INDEX_KEY, {
      projects: [
        updatedProject,
        ...projects.filter((project) => project.id !== draft.id),
      ],
    } satisfies ProjectIndex);
    return savedDraft;
  }

  draftKey(id: string): string {
    return `projects/${id}/drafts/current.json`;
  }
}
