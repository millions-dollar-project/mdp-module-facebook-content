/**
 * External-link helper.
 *
 * Tauri webview blocks `target="_blank"` and `window.open` so a
 * plain `<a target="_blank" href={...}>` from the plugin does
 * nothing — the click is silently dropped.
 *
 * `openExternal` calls the host shell's `open_external` Tauri
 * command, which spawns the OS default browser. In dev (no
 * `window.mdp.shell`) we fall back to a temporary `<a target="_blank">`
 * click so designers running the plugin standalone still get a tab.
 */
type ShellWindow = Window & {
  mdp?: {
    shell?: {
      openExternal?: (url: string) => Promise<void>;
    };
  };
};

export function openExternal(url: string): void {
  if (!url) return;
  const shell = typeof window !== 'undefined' ? (window as ShellWindow).mdp : undefined;
  if (shell?.shell?.openExternal) {
    shell.shell.openExternal(url).catch((err) => {
      console.warn('[facebook] openExternal failed, falling back to <a>:', err);
      fallbackAnchor(url);
    });
    return;
  }
  fallbackAnchor(url);
}

function fallbackAnchor(url: string): void {
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.warn('[facebook] fallback open failed:', err);
  }
}
