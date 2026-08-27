import type { PublishedManifest } from '@interactive-drama/domain';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { InteractivePlayer } from '../features/player/interactive-player.js';

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; manifest: PublishedManifest }
  | { status: 'empty' }
  | { status: 'unpublished' }
  | { status: 'error' };

export function PlayerPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const version = searchParams.get('version') ?? undefined;
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<PageState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void Promise.resolve()
      .then(async () => {
        if (projectId) return api.getPublishedManifest(projectId, version);

        const { projects } = await api.listProjects();
        const recentProjects = [...projects].sort(
          (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        );
        for (const project of recentProjects) {
          try {
            return await api.getPublishedManifest(project.id);
          } catch (cause) {
            const isUnpublished = typeof cause === 'object' && cause !== null &&
              'status' in cause && cause.status === 404;
            if (!isUnpublished) throw cause;
          }
        }
        return null;
      })
      .then((manifest) => {
        if (!active) return;
        setState(manifest ? { status: 'ready', manifest } : { status: 'empty' });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const isUnpublished = typeof cause === 'object' && cause !== null &&
          'status' in cause && cause.status === 404;
        setState(
          projectId && isUnpublished ? { status: 'unpublished' } : { status: 'error' },
        );
      });
    return () => { active = false; };
  }, [projectId, reloadKey, version]);

  if (state.status === 'ready') {
    return <div className="player-page"><InteractivePlayer manifest={state.manifest} /></div>;
  }
  if (state.status === 'empty') {
    return <main className="player-page player-page__status">暂无已发布作品</main>;
  }
  if (state.status === 'unpublished') {
    return <main className="player-page player-page__status">作品尚未发布</main>;
  }
  if (state.status === 'error') {
    return (
      <main className="player-page player-page__status">
        <p>暂时无法加载，请稍后重试</p>
        <button type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button>
      </main>
    );
  }
  return <main className="player-page player-page__status">正在加载剧情…</main>;
}
