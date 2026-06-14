if (typeof window !== 'undefined' && !(window as any).process) {
  (window as any).process = { env: { NODE_ENV: 'production' } };
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';

type RootEl = HTMLElement & { _root?: ReturnType<typeof createRoot> };
type ShellWindow = Window & {
  mdp?: {
    register?: (p: { id: string; mount: (el: HTMLElement) => void; unmount: (el?: HTMLElement) => void }) => void;
  };
};

function registerPlugin(): boolean {
  try {
    const shell = typeof window !== 'undefined' ? (window as ShellWindow).mdp : undefined;
    console.log('[facebook] window.mdp =', shell, 'register =', typeof shell?.register);
    if (shell?.register) {
      shell.register({
        id: 'facebook',
        mount(container: HTMLElement) {
          const root = createRoot(container);
          root.render(React.createElement(App));
          (container as RootEl)._root = root;
        },
        unmount(container?: HTMLElement) {
          (container as RootEl | undefined)?._root?.unmount();
        },
      });
      console.log('[facebook] registered successfully');
      return true;
    }
  } catch (err) {
    console.error('[facebook] register failed:', err);
  }
  return false;
}

if (!registerPlugin()) {
  console.log('[facebook] mdp not ready, starting poll...');
  let attempts = 0;
  const maxAttempts = 60;
  const interval = window.setInterval(() => {
    attempts += 1;
    if (registerPlugin()) {
      window.clearInterval(interval);
      return;
    }
    if (attempts >= maxAttempts) {
      window.clearInterval(interval);
      console.log('[facebook] max attempts reached, falling back to standalone mount');
      const mount = document.getElementById('root');
      if (mount) {
        createRoot(mount).render(React.createElement(App));
      } else {
        console.error('[facebook] neither window.mdp.register nor #root found');
      }
    }
  }, 50);
}
