import type {
  Asset,
  ProjectDraft,
  PublishedManifest,
  ValidationIssue,
} from '@interactive-drama/domain';

export type ProjectSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type CreatedProject = {
  project: ProjectSummary;
  draft: ProjectDraft;
};

export type UploadTargetInput = {
  fileName: string;
  contentType: 'video/mp4';
  size: number;
  duration: number;
};

export type UploadTargetResponse = {
  asset: Asset;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
};

export type ValidationResponse = {
  valid: boolean;
  issues: ValidationIssue[];
};

export type ReleaseSummary = {
  version: string;
  publishedAt: string;
  manifestUrl: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ApiError(body?.message ?? '请求失败，请稍后重试', response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  getPublishedManifest(projectId: string, version?: string): Promise<PublishedManifest> {
    const path = `/api/public/projects/${encodeURIComponent(projectId)}/manifest`;
    return request(version ? `${path}?version=${encodeURIComponent(version)}` : path);
  },

  listProjects(): Promise<{ projects: ProjectSummary[] }> {
    return request('/api/projects');
  },

  createProject(title: string): Promise<CreatedProject> {
    return request('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  },

  getDraft(id: string): Promise<ProjectDraft> {
    return request(`/api/projects/${id}/draft`);
  },

  saveDraft(draft: ProjectDraft): Promise<ProjectDraft> {
    return request(`/api/projects/${draft.id}/draft`, {
      method: 'PUT',
      body: JSON.stringify(draft),
    });
  },

  createUploadTarget(id: string, input: UploadTargetInput): Promise<UploadTargetResponse> {
    return request(`/api/projects/${id}/assets/upload-target`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  deleteAsset(projectId: string, assetId: string): Promise<void> {
    return request(`/api/projects/${projectId}/assets/${assetId}`, {
      method: 'DELETE',
    });
  },

  validateProject(projectId: string): Promise<ValidationResponse> {
    return request(`/api/projects/${projectId}/validate`, { method: 'POST' });
  },

  publishProject(projectId: string): Promise<ReleaseSummary> {
    return request(`/api/projects/${projectId}/publish`, { method: 'POST' });
  },

  listReleases(projectId: string): Promise<{ releases: ReleaseSummary[] }> {
    return request(`/api/projects/${projectId}/releases`);
  },

  async getCurrentRelease(projectId: string): Promise<ReleaseSummary | null> {
    try {
      return await request(`/api/projects/${projectId}/current`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) return null;
      throw cause;
    }
  },

  rollbackProject(projectId: string, version: string): Promise<ReleaseSummary> {
    return request(`/api/projects/${projectId}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  },
};
