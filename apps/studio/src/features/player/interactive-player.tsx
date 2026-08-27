import {
  isBranchingNode,
  type PublishedChoice,
  type PublishedManifest,
} from '@interactive-drama/domain';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

import {
  chooseBranch,
  loadProgress,
  restartStory,
  revisitNode,
  saveProgress,
  type PlayerProgress,
} from './player-progress.js';
import { StoryMap } from './story-map.js';

type PlayerPhase = 'ready' | 'loading' | 'playing' | 'reading' | 'choosing' | 'ending';
type PlaybackError = 'autoplay' | 'video' | null;
type PlayerStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function InteractivePlayer({
  manifest,
  storage = window.localStorage,
}: {
  manifest: PublishedManifest;
  storage?: PlayerStorage;
}) {
  const [progress, setProgress] = useState<PlayerProgress>(() => loadProgress(storage, manifest));
  const [phase, setPhase] = useState<PlayerPhase>('ready');
  const [mapOpen, setMapOpen] = useState(false);
  const [playbackError, setPlaybackError] = useState<PlaybackError>(null);
  const [paused, setPaused] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackAuthorizedRef = useRef(false);
  const previousNodeIdRef = useRef(progress.currentNodeId);

  const currentNode = useMemo(
    () => manifest.nodes.find((node) => node.id === progress.currentNodeId)
      ?? manifest.nodes.find((node) => node.id === manifest.startNodeId)
      ?? manifest.nodes[0],
    [manifest, progress.currentNodeId],
  );
  const choices = useMemo(
    () => [...(currentNode?.choices ?? [])].sort((a, b) => a.order - b.order),
    [currentNode],
  );
  const preloadUrls = useMemo(() => [...new Set(
    choices
      .map((choice) => manifest.nodes.find((node) => node.id === choice.targetNodeId)?.videoUrl)
      .filter((url): url is string => Boolean(url)),
  )], [choices, manifest.nodes]);

  async function playCurrent() {
    const element = videoRef.current;
    if (!element) return;
    setPlaybackError(null);
    try {
      await element.play();
      playbackAuthorizedRef.current = true;
      setPhase('playing');
      setPaused(false);
    } catch {
      setPlaybackError('autoplay');
      setPaused(true);
    }
  }

  useEffect(() => {
    if (!currentNode || previousNodeIdRef.current === currentNode.id) return;
    previousNodeIdRef.current = currentNode.id;
    setPlaybackError(null);
    setPaused(true);
    if (currentNode.videoUrl) {
      setPhase('loading');
      if (playbackAuthorizedRef.current) void playCurrent();
      return;
    }
    setPhase('reading');
  }, [currentNode]);

  if (!currentNode) {
    return <div className="interactive-player interactive-player--empty">暂无可播放剧情</div>;
  }
  const activeNode = currentNode;
  const choicePrompt = activeNode.choicePrompt?.trim() || '你会怎么选？';

  function updateProgress(next: PlayerProgress) {
    saveProgress(storage, manifest, next);
    setProgress(next);
  }

  function selectChoice(choice: PublishedChoice) {
    updateProgress(chooseBranch(progress, activeNode.id, choice.id, choice.targetNodeId));
  }

  function startStory() {
    playbackAuthorizedRef.current = true;
    if (activeNode.videoUrl) {
      void playCurrent();
      return;
    }
    setPhase('reading');
  }

  function handleEnded() {
    setPaused(true);
    if (activeNode.type === 'ending' || choices.length === 0) {
      setPhase('ending');
      return;
    }
    if (!isBranchingNode(activeNode)) {
      selectChoice(choices[0]!);
      return;
    }
    setPhase('choosing');
  }

  function retryVideo() {
    videoRef.current?.load();
    void playCurrent();
  }

  function togglePlayback() {
    const element = videoRef.current;
    if (!element) return;
    if (paused) void playCurrent();
    else {
      element.pause();
      setPaused(true);
    }
  }

  function handlePlayerTap(event: MouseEvent<HTMLElement>) {
    if (phase !== 'playing' || playbackError) return;
    if ((event.target as Element).closest('button, [role="dialog"], [role="region"]')) return;
    togglePlayback();
  }

  return (
    <main className="interactive-player" onClick={handlePlayerTap}>
      {currentNode.videoUrl && (
        <video
          key={currentNode.id}
          ref={videoRef}
          className="interactive-player__video"
          src={currentNode.videoUrl}
          aria-label="剧情视频"
          playsInline
          preload="auto"
          onEnded={handleEnded}
          onError={() => {
            setPlaybackError('video');
            setPaused(true);
          }}
        />
      )}

      <div className="interactive-player__shade" aria-hidden="true" />
      <header className="interactive-player__topbar">
        <div>
          <span>{manifest.title}</span>
          <strong>{currentNode.title}</strong>
        </div>
        <button type="button" onClick={() => setMapOpen(true)}>剧情图谱</button>
      </header>

      {phase === 'ready' && !playbackError && (
        <section className="interactive-player__start">
          <p>互动短剧</p>
          <h1>{manifest.title}</h1>
          <span>你的选择，将改变故事结局</span>
          <button type="button" onClick={startStory}>开始体验</button>
        </section>
      )}

      {phase === 'reading' && !playbackError && (
        <section className="interactive-player__script" role="region" aria-label="剧情剧本">
          <div key={currentNode.id} className="interactive-player__script-body">
            {currentNode.scriptText?.trim()}
          </div>
          <div className="interactive-player__script-actions">
            {activeNode.type === 'ending' || choices.length === 0 ? (
              <>
                <p>已到达结局</p>
                <span>已探索 {progress.unlockedNodeIds.length} / {manifest.nodes.length}</span>
                <button type="button" onClick={() => setMapOpen(true)}>查看剧情图谱</button>
                <button
                  type="button"
                  onClick={() => updateProgress(restartStory(progress, manifest.startNodeId))}
                >
                  重新体验
                </button>
              </>
            ) : choices.length === 1 ? (
              <button type="button" onClick={() => selectChoice(choices[0]!)}>继续</button>
            ) : (
              <>
                <p>{choicePrompt}</p>
                {choices.map((choice) => (
                  <button key={choice.id} type="button" onClick={() => selectChoice(choice)}>
                    {choice.text}
                  </button>
                ))}
              </>
            )}
          </div>
        </section>
      )}

      {phase === 'choosing' && !playbackError && (
        <section className="interactive-player__choices" aria-label="选择接下来的剧情">
          <p>{choicePrompt}</p>
          {choices.map((choice) => (
            <button key={choice.id} type="button" onClick={() => selectChoice(choice)}>
              {choice.text}
            </button>
          ))}
        </section>
      )}

      {phase === 'ending' && !playbackError && (
        <section className="interactive-player__ending">
          <p>已到达结局</p>
          <h2>{currentNode.title}</h2>
          <span>已探索 {progress.unlockedNodeIds.length} / {manifest.nodes.length}</span>
          <div>
            <button type="button" onClick={() => setMapOpen(true)}>查看剧情图谱</button>
            <button
              type="button"
              onClick={() => updateProgress(restartStory(progress, manifest.startNodeId))}
            >
              重新体验
            </button>
          </div>
        </section>
      )}

      {playbackError && (
        <section className="interactive-player__error" role="alert">
          <p>{playbackError === 'video'
            ? '视频加载失败'
            : '浏览器阻止了自动播放，请再次点击播放'}</p>
          <button type="button" onClick={playbackError === 'video' ? retryVideo : () => void playCurrent()}>
            {playbackError === 'video' ? '重新加载' : '再次播放'}
          </button>
        </section>
      )}

      {phase === 'playing' && preloadUrls.map((url) => (
        <video key={url} className="interactive-player__preload" src={url} preload="metadata" aria-hidden="true" />
      ))}

      {mapOpen && (
        <StoryMap
          manifest={manifest}
          progress={progress}
          onClose={() => setMapOpen(false)}
          onRevisit={(nodeId) => {
            updateProgress(revisitNode(progress, nodeId));
            setMapOpen(false);
          }}
        />
      )}
    </main>
  );
}
