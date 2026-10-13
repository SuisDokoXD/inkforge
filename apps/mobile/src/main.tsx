import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configurePlatformApi } from '@renderer/lib/api';
import type { InkforgeApi } from '@inkforge/shared';
import { createWorkspaceApi } from './workspace-api';
import { openWorkspaceStorage } from './workspace-storage';
import { createSnapshotApi } from './snapshot-api';
import '@renderer/styles.css';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
const client = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
async function start() {
  document.documentElement.classList.add('theme-light');
  const storage = await openWorkspaceStorage();
  const api = { ...createWorkspaceApi(storage), snapshot: createSnapshotApi(storage) };
  // Unsupported APIs must fail explicitly; never return fabricated success.
  const bridge = new Proxy(api, { get(target, key) {
    if (key in target) return Reflect.get(target, key);
    throw new Error(`平板尚不支持此功能：${String(key)}`);
  } });
  configurePlatformApi(bridge as unknown as InkforgeApi);
  root.render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
}
void start().catch(() => root.render(<div role="alert">无法打开本地存储，请重启应用重试。</div>));
