import React, { useState } from 'react';
import { StudioTabs, KanbanBoard, FormField, DoubleBezel, BentoCard } from '@mdp-private/kit-ui';
import type { KanbanCardData, KanbanColumn } from '@mdp-private/kit-ui';
import { BrainFeedTab } from '../tabs/BrainFeedTab';

export interface CrawlItem {
  title: string;
  desc: string;
  ago?: string;
}

export interface StudioFrameProps {
  brainContent: React.ReactNode;
  kanbanCards: KanbanCardData[];
  crawlItems: CrawlItem[];
  onRunCrawl?: (target: string) => void;
  isCrawling?: boolean;
  crawlProgress?: number;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onGoToCrawl?: () => void;
  onDraftsReady?: (feedIds: string[]) => void;
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
    crawlItems,
    onRunCrawl,
    isCrawling = false,
    crawlProgress = 0,
    activeTab,
    onTabChange,
    onGoToCrawl,
    onDraftsReady,
  } = props;

  const [localActive, setLocalActive] = useState('brain');
  const active = activeTab !== undefined ? activeTab : localActive;
  const setActive = onTabChange !== undefined ? onTabChange : setLocalActive;

  const [crawlTarget, setCrawlTarget] = useState('https://facebook.com/tech_reviewer_vietnam');

  return (
    <div className="view-pane">
      <StudioTabs
        active={active}
        onChange={setActive}
        tabs={[
          { id: 'brain', label: 'Composer' },
          { id: 'kanban', label: 'Kanban' },
          { id: 'crawl', label: 'Crawl' },
          { id: 'brain-feed', label: 'Brain Feed' },
        ]}
      />

      {active === 'brain' && brainContent}
      {active === 'kanban' && (
        <div className="studio-pane active" data-testid="kanban-pane">
          <KanbanBoard cards={kanbanCards} columns={KANBAN_COLUMNS} />
        </div>
      )}
      {active === 'crawl' && (
        <div className="studio-pane active" data-testid="crawl-pane">
          <div className="bento-grid">
            <BentoCard span={6}>
              <DoubleBezel>
                <h3>Crawl Configuration</h3>
                <FormField
                  label="Target Page URL / ID"
                  value={crawlTarget}
                  onChange={setCrawlTarget}
                  placeholder="https://facebook.com/..."
                />
                {isCrawling && (
                  <div style={{ margin: '12px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                      <span>Scraping profiles...</span>
                      <span>{crawlProgress}%</span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${crawlProgress}%`, background: 'var(--primary)', transition: 'width 0.1s linear' }} />
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isCrawling}
                  onClick={() => onRunCrawl?.(crawlTarget)}
                >
                  Run Discovery Crawl
                </button>
              </DoubleBezel>
            </BentoCard>
            <BentoCard span={6}>
              <DoubleBezel>
                <h3>Crawled Feeds & Source Stream</h3>
                <div className="crawler-list" data-testid="crawl-list">
                  {crawlItems.map((item, i) => (
                    <div key={i} className="crawl-item">
                      <span className="material-symbols-outlined">rss_feed</span>
                      <div className="crawl-item-content">
                        <h5>{item.title}</h5>
                        <p>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </DoubleBezel>
            </BentoCard>
          </div>
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
