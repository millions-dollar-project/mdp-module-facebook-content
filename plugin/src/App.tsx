import React from 'react';
import { FacebookView } from './views/FacebookView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SelectedAccountProvider } from './state/SelectedAccountContext';

export const App: React.FC = () => {
  return (
    <div className="view-pane" data-testid="fb-content-root">
      <SelectedAccountProvider>
        <ErrorBoundary label="FacebookView">
          <FacebookView />
        </ErrorBoundary>
      </SelectedAccountProvider>
    </div>
  );
};

export default App;
