import React from 'react';
import { FacebookView } from './views/FacebookView';
import { ErrorBoundary } from './components/ErrorBoundary';

// Inline fallback: a guaranteed-to-render banner so a blank canvas
// can never silently happen. If even this doesn't show, the bundle
// itself failed to load (script tag 404, parse error, or
// window.mdp.register never fires).
const FallbackBanner: React.FC = () => (
  <div
    style={{
      padding: 12,
      margin: 12,
      borderRadius: 8,
      background: 'rgba(46, 204, 113, 0.15)',
      border: '1px solid rgba(46, 204, 113, 0.4)',
      color: '#0a3d1f',
      fontFamily: 'system-ui, sans-serif',
      fontSize: 13,
    }}
    data-testid="fb-content-fallback"
  >
    ✅ FB Content bundle loaded — v0.1.0 (kit-accounts). If the tabs below
    don't appear, an inner component threw; check DevTools console.
  </div>
);

export const App: React.FC = () => {
  return (
    <div className="view-pane" data-testid="fb-content-root">
      <FallbackBanner />
      <ErrorBoundary label="FacebookView">
        <FacebookView />
      </ErrorBoundary>
    </div>
  );
};

export default App;
