import React, { useState } from 'react';
import { StudioTabs } from '@mdp-private/kit-ui';
import type { KanbanCardData } from '@mdp-private/kit-ui';

export interface CrawlItem {
  title: string;
  desc: string;
  ago?: string;
}

/** Auto-reply rule shape (mirrors design-mockup app.js accAutomation). */
export interface ReplyRule {
  id: string;
  keyword: string;
  action: 'reply' | 'escalate' | 'hide';
}

/** Per-account automation config (mirrors design-mockup). */
export interface AutomationConfig {
  scheduleOn: boolean;
  cadence: string;
  warmupStage: string;
  autopilot: boolean;
  rules: ReplyRule[];
}

export interface StudioFrameProps {
  brainContent: React.ReactNode;
  /** Lifecycle kanban cards (ideas → todo → progress → confirm → published). */
  kanbanCards: KanbanCardData[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  /** Approve an idea card → moves it to "progress" with a brain-draft note. */
  onApproveIdea?: (cardId: string) => void;
  /** Element rendered on the left of the studio-account-bar (name + badges). */
  accountBar?: React.ReactNode;
  /** Plain account name used in the automation pane copy. */
  accountBarName?: string;
  /** Crawl pane content. */
  crawlSlot: () => React.ReactNode;
  /** Automation pane config + handlers. */
  automation?: AutomationConfig;
  onToggleSchedule?: () => void;
  onSetCadence?: (v: string) => void;
  onToggleAutopilot?: () => void;
  onAddReplyRule?: (keyword: string, action: ReplyRule['action']) => void;
  onDelReplyRule?: (id: string) => void;
}

const REPLY_ACTION_LABEL: Record<ReplyRule['action'], string> = {
  reply: 'Auto-reply template',
  escalate: 'Escalate to staff',
  hide: 'Flag & hide (spam)',
};

const KANBAN_COLS = ['ideas', 'todo', 'progress', 'confirm', 'published'] as const;
const KANBAN_LABEL: Record<(typeof KANBAN_COLS)[number], string> = {
  ideas: 'IDEAS',
  todo: 'TODO',
  progress: 'IN PROGRESS',
  confirm: 'CONFIRM',
  published: 'PUBLISHED',
};

function LifecycleKanban({
  cards,
  onApproveIdea,
}: {
  cards: KanbanCardData[];
  onApproveIdea?: (cardId: string) => void;
}): React.ReactElement {
  return (
    <div className="kanban-board-layout" id="fb-kanban-board">
      {KANBAN_COLS.map((col) => {
        const colCards = cards.filter((c) => c.status === col);
        return (
          <div
            key={col}
            className={`kanban-column ${col === 'ideas' ? 'kanban-column-ideas' : ''}`}
          >
            <div className="kanban-column-header">
              <h4>{KANBAN_LABEL[col]}</h4>
              <span className="count-badge">{colCards.length}</span>
            </div>
            <div className="kanban-cards-wrapper">
              {colCards.map((card) => (
                <div
                  key={card.id}
                  className={`kanban-card ${col === 'ideas' ? 'kanban-card-idea' : ''}`}
                >
                  {col === 'ideas' && (
                    <span className="idea-flag">
                      <i className="ph-light ph-lightbulb" /> Brain idea
                    </span>
                  )}
                  <h5>{card.title}</h5>
                  <p>{card.desc}</p>
                  <div className="kcard-footer">
                    <span className="kcard-profile" title="Suggested writing profile">
                      ✍ {card.profile ?? '—'}
                    </span>
                    <span>{card.date}</span>
                  </div>
                  {col === 'ideas' && (
                    <button
                      type="button"
                      className="btn-micro w-full mt-2"
                      onClick={() => onApproveIdea?.(card.id)}
                    >
                      Approve → write draft
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AutomationPane({
  config,
  accountName,
  onToggleSchedule,
  onSetCadence,
  onToggleAutopilot,
  onAddReplyRule,
  onDelReplyRule,
}: {
  config: AutomationConfig;
  accountName: string;
  onToggleSchedule?: () => void;
  onSetCadence?: (v: string) => void;
  onToggleAutopilot?: () => void;
  onAddReplyRule?: (keyword: string, action: ReplyRule['action']) => void;
  onDelReplyRule?: (id: string) => void;
}): React.ReactElement {
  const [kw, setKw] = useState('');
  const [act, setAct] = useState<ReplyRule['action']>('reply');
  return (
    <div className="automation-body" id="fb-automation-body">
      <div className="bento-grid">
        {/* Schedule & Warmup */}
        <div className="bento-card col-span-6 double-bezel">
          <div className="card-inner">
            <div className="card-header">
              <h3>Schedule &amp; Warmup</h3>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={config.scheduleOn}
                  onChange={() => onToggleSchedule?.()}
                />
                <span>{config.scheduleOn ? 'On' : 'Off'}</span>
              </label>
            </div>
            <p className="desc mb-4">
              Posting cadence + warmup pace for <strong>{accountName}</strong>. Auto-pulls
              approved posts from this account&apos;s Kanban and publishes via browser-sim.
            </p>
            <div className="form-group">
              <label>Posting cadence</label>
              <input
                className="form-input"
                value={config.cadence}
                onChange={(e) => onSetCadence?.(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Warmup stage</label>
              <input className="form-input" value={config.warmupStage} readOnly />
            </div>
            <div className="autopilot-row">
              <div>
                <strong>Autopilot</strong>
                <p className="desc">
                  Skip human review: idea → draft → auto-publish. Use only for accounts that
                  can take the risk.
                </p>
              </div>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={config.autopilot}
                  onChange={() => onToggleAutopilot?.()}
                />
                <span className={config.autopilot ? 'pulse-text' : ''}>
                  {config.autopilot ? 'Active' : 'Off'}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Auto-Reply Rules */}
        <div className="bento-card col-span-6 double-bezel">
          <div className="card-inner">
            <h3>Auto-Reply Rules</h3>
            <p className="desc mb-4">
              IF a comment contains a keyword → THEN act. Replies use this account&apos;s chosen
              AI profile for consistent voice.
            </p>
            <div className="rules-builder-list">
              {config.rules.map((r) => (
                <div className="rule-block-card" key={r.id}>
                  <span>
                    IF &quot;<strong>{r.keyword}</strong>&quot; →{' '}
                    <strong>{REPLY_ACTION_LABEL[r.action]}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn-micro"
                    onClick={() => onDelReplyRule?.(r.id)}
                  >
                    <i className="ph-light ph-trash" />
                  </button>
                </div>
              ))}
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '16px 0' }} />
            <div className="form-group">
              <label>IF comment contains</label>
              <input
                className="form-input"
                placeholder="E.g., giá, ship, scam"
                value={kw}
                onChange={(e) => setKw(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>THEN</label>
              <select
                className="form-select"
                value={act}
                onChange={(e) => setAct(e.target.value as ReplyRule['action'])}
              >
                <option value="reply">Auto-reply template</option>
                <option value="escalate">Escalate to staff</option>
                <option value="hide">Flag &amp; hide (spam)</option>
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => {
                onAddReplyRule?.(kw.trim(), act);
                setKw('');
              }}
            >
              Add rule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudioFrame(props: StudioFrameProps): React.ReactElement {
  const {
    brainContent,
    kanbanCards,
    activeTab,
    onTabChange,
    onApproveIdea,
    accountBar,
    crawlSlot,
    automation,
    onToggleSchedule,
    onSetCadence,
    onToggleAutopilot,
    onAddReplyRule,
    onDelReplyRule,
  } = props;

  const [localActive, setLocalActive] = useState('brain');
  const active = activeTab !== undefined ? activeTab : localActive;
  const setActive = onTabChange !== undefined ? onTabChange : setLocalActive;

  return (
    <div className="fb-studio-frame">
      {accountBar}
      <StudioTabs
        active={active}
        onChange={setActive}
        tabs={[
          { id: 'brain', label: 'AI Composer' },
          { id: 'kanban', label: 'Kanban Lifecycle' },
          { id: 'crawl', label: 'Crawl & Input' },
          { id: 'automation', label: 'Automation' },
        ]}
      />

      {active === 'brain' && brainContent}
      {active === 'kanban' && (
        <div className="studio-pane active" data-testid="kanban-pane">
          <div className="studio-pane active" id="fb-studio-kanban">
            <LifecycleKanban cards={kanbanCards} onApproveIdea={onApproveIdea} />
          </div>
        </div>
      )}
      {active === 'crawl' && (
        <div className="studio-pane active" data-testid="crawl-pane">
          {crawlSlot()}
        </div>
      )}
      {active === 'automation' && (
        <div className="studio-pane active" data-testid="automation-pane">
          {automation ? (
            <AutomationPane
              config={automation}
              accountName={props.accountBarName ?? 'this account'}
              onToggleSchedule={onToggleSchedule}
              onSetCadence={onSetCadence}
              onToggleAutopilot={onToggleAutopilot}
              onAddReplyRule={onAddReplyRule}
              onDelReplyRule={onDelReplyRule}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export default StudioFrame;
