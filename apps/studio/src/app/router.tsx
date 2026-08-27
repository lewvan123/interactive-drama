import { Navigate, createBrowserRouter } from 'react-router-dom';

import { EditorPage } from '../pages/editor-page.js';
import { PlayerPage } from '../pages/player-page.js';
import { ProjectsPage } from '../pages/projects-page.js';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/studio" replace /> },
  { path: '/play', element: <PlayerPage /> },
  { path: '/play/:projectId', element: <PlayerPage /> },
  { path: '/studio', element: <ProjectsPage /> },
  { path: '/studio/projects/:id/edit', element: <EditorPage /> },
]);
