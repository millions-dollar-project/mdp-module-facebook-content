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

// Prod (IIFE) compatibility: the shell's prod loader injects this bundle as a
// <script> and waits for window.mdp.register. Dev loads the ESM exports above
// directly, so this self-registration only fires in the bundled build.
const mdpHost = (globalThis as { mdp?: { register?: (r: { id: string; mount: typeof mount; unmount: typeof unmount }) => void } }).mdp;
if (mdpHost?.register) {
  mdpHost.register({ id, mount, unmount });
}
