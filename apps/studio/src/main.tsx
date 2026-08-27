import { App as AntApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { router } from './app/router.js';
import './styles/player.css';
import './styles/theme.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('应用挂载节点不存在');
}

createRoot(root).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#9edc70',
          colorInfo: '#9edc70',
          colorBgBase: '#101310',
          colorTextBase: '#eef2eb',
          borderRadius: 8,
          fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }}
    >
      <AntApp>
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
