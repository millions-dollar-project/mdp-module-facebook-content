import React, { useState } from 'react';
import { StudioTabs, KanbanBoard } from '@mdp-private/kit-ui';
import type { KanbanCardData, KanbanColumn } from '@mdp-private/kit-ui';
import { BrainFeedTab } from '../tabs/BrainFeedTab';
import { EmptyState } from '../components';

export interface CrawlItem {
  title: string;
  desc: string;
  ago?: string;
}

export interface StudioFrameProps {
  brainContent: React.ReactNode;
  kanbanCards: KanbanCardData[];
  crawlItems?: CrawlItem[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onGoToCrawl?: () => void;
  onDraftsReady?: (feedIds: string[]) => void;
  /**
   * Optional element rendered in the header strip next to the tabs —
   * `FacebookView` uses this for a "Switch account" button that
   * drops the picked account and bounces back to the picker.
   */
  headerExtras?: React.ReactNode;
  /**
   * Callback that switches the parent tab to "Brain Feed". Surfaced
   * here so a child of the Crawl pane (e.g. `RepostCrawlSection`) can
   * trigger a tab change after auto-ingesting crawled posts.
   */
  onOpenBrainFeed?: () => void;
  /**
   * Slot to render inside the Crawl pane. Required — the parent
   * (e.g. `FacebookView`) must provide the real `RepostCrawlSection`
   * so this tab stays consistent with Composer/Kanban/Brain Feed.
   * The render function receives `onOpenBrainFeed` so the slot can
   * switch tabs after auto-ingest.
   */
  crawlSlot: (helpers: { onOpenBrainFeed?: () => void }) => React.ReactNode;
  /**
   * Slot to render inside the Kanban pane. When omitted the legacy
   * `KanbanBoard` from @mdp-private/kit-ui is shown (the historical
   * composer-flow cards). When supplied it receives the active kit
   * account id so it can filter the scheduled-posts query.
   */
  kanbanSlot?: (helpers: { accountId?: string }) => React.ReactNode;
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'progress', title: 'In Progress' },
  { id: 'confirm', title: 'Awaiting Confirm' },
  { id: 'published', title: 'Published' },
];

export function StudioFrame(props: StudioFrameProps): React.ReactElement {
  const {
    brainContent,
    kanbanCards,
    activeTab,
    onTabChange,
    onGoToCrawl,
    onDraftsReady,
    headerExtras,
    onOpenBrainFeed,
    crawlSlot,
    kanbanSlot,
  } = props;

  const [localActive, setLocalActive] = useState('brain');
  const active = activeTab !== undefined ? activeTab : localActive;
  const setActive = onTabChange !== undefined ? onTabChange : setLocalActive;

  return (
    <div className="view-pane">
      {headerExtras && (
        <div
          data-testid="studio-header-extras"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '8px 12px 0',
          }}
        >
          {headerExtras}
        </div>
      )}
      <StudioTabs
        active={active}
        onChange={setActive}
        tabs={[
          { id: 'brain', label: 'Composer' },
          { id: 'kanban', label: 'Kanban' },
          { id: 'crawl', label: 'Crawl' },
          { id: 'brain-feed', label: 'Brain' },
        ]}
      />

      {active === 'brain' && brainContent}
      {active === 'kanban' && (
        <div className="studio-pane active" data-testid="kanban-pane">
          {kanbanSlot ? (
            kanbanSlot({ accountId: undefined })
          ) : (
            <KanbanBoard cards={kanbanCards} columns={KANBAN_COLUMNS} />
          )}
        </div>
      )}
      {active === 'crawl' && (
        <div className="studio-pane active" data-testid="crawl-pane">
          {crawlSlot ? (
            crawlSlot({ onOpenBrainFeed })
          ) : (
            <EmptyState
              title="Crawl tab is not configured"
              subtitle="FacebookView must pass a crawlSlot prop."
            />
          )}
        </div>
      )}
      {active === 'brain-feed' && (
        <div className="studio-pane active" data-testid="brain-feed-pane">
          <BrainFeedTab
            onGoToCrawl={() => onGoToCrawl?.() ?? setActive('crawl')}
            onDraftsReady={(ids) => onDraftsReady?.(ids)}
          />
        </div>
      )}
    </div>
  );
}

export default StudioFrame;