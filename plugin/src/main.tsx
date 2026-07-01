if (typeof window !== 'undefined' && !(window as any).process) {
  (window as any).process = { env: { NODE_ENV: 'production' } };
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';

type RootEl = HTMLElement & { _root?: ReturnType<typeof createRoot> };

export const id = 'facebook-content';

export function mount(container: HTMLElement): void {
  const root = createRoot(container);
  root.render(React.createElement(App));
  (container as RootEl)._root = root;
}

export function unmount(container?: HTMLElement): void {
  (container as RootEl | undefined)?._root?.unmount();
}
