import React, { useCallback, useRef, useState } from 'react';
import { StudioFrame } from './StudioFrame';
import type { AutomationConfig, ReplyRule } from './StudioFrame';
import { AccountPickerView } from './AccountPickerView';
import type { AccountCardData, KanbanCardData } from '@mdp-private/kit-ui';
import { useToast } from '../components';
import { useSelectedAccount } from '../state/SelectedAccountContext';
import { AccountLoginDialog } from '../tabs/AccountLoginDialog';
import { AddFacebookAccountDialog } from '../tabs/AddFacebookAccountDialog';
import { RepostCrawlSection } from '../tabs/RepostCrawlSection';
import { KanbanTab } from '../tabs/KanbanTab';

// The lifecycle kanban is a browser-sim (no real API) board matching the
// design-mockup: ideas → todo → progress → confirm → published.
const SEED_CARDS: KanbanCardData[] = [
  { id: 'fb-1', title: 'Aula F75 deal roundup', desc: 'Tổng hợp deal bàn phím cơ', status: 'todo', profile: 'Affiliate Tech Page', date: '2026-06-22', platform: 'facebook' },
  { id: 'fb-2', title: 'Silent switch shootout', desc: 'So sánh silent switches 2026', status: 'progress', profile: 'Affiliate Tech Page', date: '2026-06-23', platform: 'facebook' },
  { id: 'fb-3', title: 'GenZ meme keyboard', desc: 'Meme trending keyboard post', status: 'confirm', profile: 'GenZ Viral', date: '2026-06-21', platform: 'facebook' },
];

const PROFILE_OPTIONS = [
  { value: 'tech', label: 'Tech Reviewer / Affiliate' },
  { value: 'soccer', label: 'Football Trend Master' },
  { value: 'meme', label: 'GenZ Viral Meme Hub' },
];

const IDEA_SEEDS = [
  'Review nhanh + link affiliate',
  'Khịa trend tech tuần này',
  'Tóm tắt tin nóng (text)',
  'So sánh 2 sản phẩm hot',
  'Meme bắt trend cho GenZ',
];

// Sample FB draft the "AI Brain" produces (mirrors triggerBrainPostGeneration).
const FB_SAMPLE =
  '🔥 DEAL BÀN PHÍM CƠ HOT NHẤT HÔM NAY 🔥\n\nAula F75 Silent - chiếc bàn phím êm ái nhất năm nay đã lên kệ với giá ưu đãi cực sốc cho anh em cú đêm. Giá chỉ còn 890k tại link bio! #MechanicalKeyboard #Affiliate';

interface BrainComposerProps {
  prompt: string;
  setPrompt: (v: string) => void;
  profile: string;
  setProfile: (v: string) => void;
  monetizeType: string;
  setMonetizeType: (v: string) => void;
  monetizeLink: string;
  setMonetizeLink: (v: string) => void;
  media: string;
  setMedia: (v: string) => void;
  isGenerating: boolean;
  status: string;
  onGenerate: () => void;
  onRegenerate: () => void;
  onDiscard: () => void;
  onPush: () => void;
  onSuggestIdeas: () => void;
  onJumpVideo: () => void;
  previewText: string;
  showMedia: string;
  feedback: string;
  setFeedback: (v: string) => void;
  previewRef: React.RefObject<HTMLDivElement>;
}

function FacebookBrain(p: BrainComposerProps): React.ReactElement {
  const ready = !!p.previewText && !p.isGenerating;
  return (
    <div className="studio-pane active" id="fb-studio-brain" data-testid="brain-pane">
      <div className="split-composer">
        <div className="composer-left double-bezel">
          <div className="card-inner">
            <div className="composer-head">
              <h3>Initiate Idea with AI Brain</h3>
              <button
                type="button"
                className="btn btn-secondary btn-micro"
                onClick={p.onSuggestIdeas}
              >
                <i className="ph-light ph-lightbulb" /> <span>Suggest ideas with AI</span>
              </button>
            </div>

            <div className="form-group">
              <label>AI Profile (writing guide)</label>
              <select
                id="fb-brain-profile"
                className="form-select"
                value={p.profile}
                onChange={(e) => p.setProfile(e.target.value)}
              >
                {PROFILE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Core Prompt / Seed Idea</label>
              <textarea
                id="fb-prompt"
                className="form-textarea"
                value={p.prompt}
                onChange={(e) => p.setPrompt(e.target.value)}
                placeholder="E.g., Tổng hợp các deal bàn phím cơ hot nhất..."
              />
            </div>

            <div className="form-group">
              <label>Monetization Type &amp; Link</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  id="fb-monetize-type"
                  className="form-select"
                  style={{ flex: 1 }}
                  value={p.monetizeType}
                  onChange={(e) => p.setMonetizeType(e.target.value)}
                >
                  <option value="none">No Link</option>
                  <option value="shopee">Shopee Affiliate</option>
                  <option value="blog">Blog Ad Link</option>
                </select>
                <input
                  type="text"
                  id="fb-monetize-link"
                  className="form-input"
                  style={{ flex: 2 }}
                  value={p.monetizeLink}
                  onChange={(e) => p.setMonetizeLink(e.target.value)}
                  placeholder="https://shopee.vn/... or blog link"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Media Option</label>
              <div className="radio-group">
                {[
                  { value: 'text', label: 'Text Only' },
                  { value: 'image', label: 'Generate AI Cover' },
                  { value: 'video', label: 'Link AI Video' },
                ].map((o) => (
                  <label className="radio-pill" key={o.value}>
                    <input
                      type="radio"
                      name="fb-media-opt"
                      value={o.value}
                      checked={p.media === o.value}
                      onChange={() => p.setMedia(o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {p.media === 'video' && (
              <div className="form-group" id="fb-video-flow-jump">
                <button type="button" className="btn btn-secondary w-full" onClick={p.onJumpVideo}>
                  <i className="ph-light ph-video-camera" />
                  <span>Compose Video in AI Studio</span>
                </button>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary w-full mt-4"
              id="fb-generate-btn"
              disabled={p.isGenerating}
              onClick={p.onGenerate}
            >
              <span>Draft Post with Brain</span>
              <div className="arrow-wrap">
                <i className="ph-light ph-sparkle" />
              </div>
            </button>
          </div>
        </div>

        <div className="composer-right double-bezel">
          <div className="card-inner">
            <div className="panel-header-sub">
              <h3>Live Output Preview</h3>
              <span className="preview-status" id="fb-preview-status">
                {p.status}
              </span>
            </div>

            <div className="fb-preview-card">
              <div className="fb-preview-header">
                <div className="fb-avatar">FB</div>
                <div>
                  <h5>
                    Affiliate Tech Page{' '}
                    <span className="verified-badge">
                      <i className="ph-fill ph-seal-check" />
                    </span>
                  </h5>
                  <span>Just now · Simulated Preview</span>
                </div>
              </div>

              <div
                className="fb-preview-body editable-body"
                id="fb-preview-body"
                contentEditable
                suppressContentEditableWarning
                ref={p.previewRef}
              >
                {p.isGenerating ? (
                  <span className="media-loader">AI Brain compiling prompts...</span>
                ) : p.previewText ? (
                  p.previewText
                ) : (
                  <p className="placeholder-text">
                    Output will appear here once AI Brain generates the draft...
                  </p>
                )}
              </div>

              {p.showMedia === 'image' && (
                <div className="fb-preview-media" id="fb-preview-image-box">
                  <div className="media-loader">Generating AI Cover Art...</div>
                </div>
              )}
              {p.showMedia === 'video' && (
                <div className="fb-preview-media" id="fb-preview-video-box">
                  <div className="media-loader">AI Video Preview Container</div>
                </div>
              )}

              <div className="fb-preview-footer">
                <span>
                  <i className="ph-light ph-thumbs-up" /> <span>Like</span>
                </span>
                <span>
                  <i className="ph-light ph-chat-circle" /> <span>Comment</span>
                </span>
                <span>
                  <i className="ph-light ph-share-network" /> <span>Share</span>
                </span>
              </div>
            </div>

            {ready && (
              <div className="composer-feedback" id="fb-feedback-wrap">
                <label>Feedback to Brain (regenerate)</label>
                <div className="feedback-row">
                  <input
                    type="text"
                    className="form-input"
                    id="fb-feedback"
                    value={p.feedback}
                    onChange={(e) => p.setFeedback(e.target.value)}
                    placeholder="E.g., punchier hook, add price, less salesy..."
                  />
                  <button type="button" className="btn btn-secondary" onClick={p.onRegenerate}>
                    <i className="ph-light ph-arrows-clockwise" /> Regenerate
                  </button>
                </div>
                <p className="dash-sub">
                  Or edit the text directly in the preview above before pushing.
                </p>
              </div>
            )}
            {ready && (
              <div className="preview-actions" id="fb-preview-actions">
                <button type="button" className="btn btn-secondary" onClick={p.onDiscard}>
                  Discard
                </button>
                <button type="button" className="btn btn-primary" onClick={p.onPush}>
                  Push to Kanban Board
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FacebookView(): React.ReactElement {
  const [activeTab, setActiveTab] = useState('brain');
  const [cards, setCards] = useState<KanbanCardData[]>(SEED_CARDS);
  const {
    account: picked,
    reloadAccounts: reloadCtxAccounts,
    setAccount,
  } = useSelectedAccount();
  const [loginIntent, setLoginIntent] = useState<{ name: string } | null>(null);
  const toast = useToast();

  const [prompt, setPrompt] = useState('');
  const [profile, setProfile] = useState('tech');
  const [monetizeType, setMonetizeType] = useState('none');
  const [monetizeLink, setMonetizeLink] = useState('');
  const [media, setMedia] = useState('text');
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [showMedia, setShowMedia] = useState('none');
  const [status, setStatus] = useState('Idle');
  const [feedback, setFeedback] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  // Automation config is per-account (browser-sim, no real API).
  const [automation, setAutomation] = useState<AutomationConfig>({
    scheduleOn: true,
    cadence: '3 posts / day (peak hours)',
    warmupStage: 'Mature (full cadence)',
    autopilot: false,
    rules: [
      { id: 'r1', keyword: 'cảm ơn / thanks / 👍', action: 'reply' },
      { id: 'r2', keyword: 'giá / bao nhiêu / ship', action: 'escalate' },
      { id: 'r3', keyword: 'lừa đảo / scam', action: 'hide' },
    ],
  });

  const profileLabel = (v: string): string =>
    PROFILE_OPTIONS.find((o) => o.value === v)?.label ?? v;

  // triggerBrainPostGeneration: validate → Thinking (loader) → ~4s →
  // sample + monetize link append → Ready (reveals feedback + actions).
  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) {
      toast.push('Please specify a prompt first.', 'info');
      return;
    }
    setIsGenerating(true);
    setStatus('Thinking...');
    setPreviewText('');
    setShowMedia('none');

    setTimeout(() => {
      let output = FB_SAMPLE;
      if (monetizeType !== 'none' && monetizeLink.trim()) {
        if (monetizeType === 'shopee') {
          output += `\n\n👉 Mua ngay tại Shopee: ${monetizeLink.trim()}`;
        } else if (monetizeType === 'blog') {
          output += `\n\n👉 Đọc review chi tiết tại Blog: ${monetizeLink.trim()}`;
        }
      }
      setPreviewText(output);
      setShowMedia(media);
      setStatus('Ready');
      setIsGenerating(false);
      toast.success('Post generated by AI Brain!');
    }, 4000);
  }, [prompt, monetizeType, monetizeLink, media, toast]);

  // regenerateWithFeedback: append the note to the prompt and re-run.
  const handleRegenerate = useCallback(() => {
    if (!feedback.trim()) {
      toast.push('Type feedback first.', 'info');
      return;
    }
    setPrompt((prev) => `${prev}\n[Feedback: ${feedback.trim()}]`);
    setFeedback('');
    toast.push('Regenerating draft with your feedback…', 'info');
    // Re-run with the fresh prompt on next tick.
    setIsGenerating(true);
    setStatus('Thinking...');
    setPreviewText('');
    setShowMedia('none');
    setTimeout(() => {
      let output = FB_SAMPLE;
      if (monetizeType !== 'none' && monetizeLink.trim()) {
        output +=
          monetizeType === 'shopee'
            ? `\n\n👉 Mua ngay tại Shopee: ${monetizeLink.trim()}`
            : `\n\n👉 Đọc review chi tiết tại Blog: ${monetizeLink.trim()}`;
      }
      setPreviewText(output);
      setShowMedia(media);
      setStatus('Ready');
      setIsGenerating(false);
      toast.success('Post generated by AI Brain!');
    }, 4000);
  }, [feedback, monetizeType, monetizeLink, media, toast]);

  const handleDiscard = useCallback(() => {
    setPrompt('');
    setPreviewText('');
    setShowMedia('none');
    setStatus('Idle');
    setFeedback('');
  }, []);

  // pushToKanban: read the (possibly edited) contenteditable body, unshift a
  // TODO card with the selected AI profile, toast, switch to kanban.
  const handlePushToKanban = useCallback(() => {
    const bodyText = previewRef.current?.innerText?.trim() || previewText;
    if (!bodyText) return;
    const newCard: KanbanCardData = {
      id: `k${Date.now()}`,
      title: bodyText.split('\n')[0].substring(0, 32) + '...',
      desc: bodyText,
      platform: 'facebook',
      status: 'todo',
      profile: profileLabel(profile),
      date: 'Just now',
    };
    setCards((prev) => [newCard, ...prev]);
    handleDiscard();
    toast.success('Draft pushed to TODO Kanban column!');
    setActiveTab('kanban');
  }, [previewText, profile, handleDiscard, toast]);

  // suggestIdeas: unshift 3 idea cards into the Ideas column, switch to kanban.
  const handleSuggestIdeas = useCallback(() => {
    toast.push('AI Brain is generating ideas…', 'info');
    setTimeout(() => {
      setCards((prev) => {
        const extra: KanbanCardData[] = [0, 1, 2].map((i) => {
          const seed = IDEA_SEEDS[(i + prev.length) % IDEA_SEEDS.length];
          return {
            id: `idea${Date.now()}-${i}`,
            title: seed,
            desc: 'AI-suggested idea for Facebook. Approve to let Brain write the draft.',
            platform: 'facebook',
            status: 'ideas',
            profile: profileLabel(profile),
            date: 'Just now',
          };
        });
        return [...extra, ...prev];
      });
      toast.success('Added 3 ideas to the Ideas column (Kanban).');
      setActiveTab('kanban');
    }, 1200);
  }, [profile, toast]);

  // approveIdea: brain "writes" the draft → move idea to progress.
  const handleApproveIdea = useCallback(
    (cardId: string) => {
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? {
                ...c,
                status: 'progress',
                desc: `[Brain draft via "${c.profile}"] ${c.desc}`,
              }
            : c
        )
      );
      toast.success('Brain writing draft with the suggested profile');
    },
    [toast]
  );

  const handleJumpVideo = useCallback(() => {
    // Playwright-sim: no real video studio in this module; carry the prompt.
    toast.push('Jumped to Video Studio. Ready to link B-roll back to FACEBOOK', 'info');
  }, [toast]);

  // --- Automation handlers (mirror app.js) ---
  const toggleSchedule = useCallback(() => {
    setAutomation((c) => {
      const next = !c.scheduleOn;
      toast.push(`Schedule ${next ? 'on' : 'off'} for ${picked?.name ?? 'account'}`, 'info');
      return { ...c, scheduleOn: next };
    });
  }, [picked, toast]);

  const setCadence = useCallback((v: string) => {
    setAutomation((c) => ({ ...c, cadence: v }));
  }, []);

  const toggleAutopilot = useCallback(() => {
    setAutomation((c) => {
      const next = !c.autopilot;
      if (next) {
        toast.push(`Autopilot ON for ${picked?.name ?? 'account'} — posts skip review.`, 'info');
      } else {
        toast.push(`Autopilot off for ${picked?.name ?? 'account'}.`, 'info');
      }
      return { ...c, autopilot: next };
    });
  }, [picked, toast]);

  const addReplyRule = useCallback(
    (keyword: string, action: ReplyRule['action']) => {
      if (!keyword) {
        toast.push('Enter a keyword.', 'info');
        return;
      }
      setAutomation((c) => ({
        ...c,
        rules: [...c.rules, { id: `r${Date.now()}`, keyword, action }],
      }));
      toast.success('Reply rule added.');
    },
    [toast]
  );

  const delReplyRule = useCallback((id: string) => {
    setAutomation((c) => ({ ...c, rules: c.rules.filter((r) => r.id !== id) }));
  }, []);

  const handleSwitch = useCallback(() => setAccount(null), [setAccount]);
  const handleAdd = useCallback(() => setLoginIntent({ name: '' }), []);
  const handleLoginSuccess = useCallback(() => {
    reloadCtxAccounts();
    setLoginIntent(null);
  }, [reloadCtxAccounts]);

  // Picker-first entry: always show the picker on a fresh tab session.
  const SESSION_FLAG = 'mdp.fb-content.sessionStarted';
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    let fresh = false;
    try {
      fresh = !window.sessionStorage.getItem(SESSION_FLAG);
      if (fresh) window.sessionStorage.setItem(SESSION_FLAG, '1');
    } catch {
      /* ignore */
    }
    if (fresh) setAccount(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePick = useCallback((_a: AccountCardData) => {
    void _a;
  }, []);

  const viewHeader = (
    <div className="view-header">
      <div>
        <p className="eyebrow">FACEBOOK MODULE</p>
        <h2>Facebook Studio &amp; Automation</h2>
      </div>
    </div>
  );

  if (!picked) {
    return (
      <div className="fb-studio-root">
        {viewHeader}
        <AccountPickerView onPick={handlePick} onAdd={handleAdd} />
        {loginIntent && (
          <AccountLoginDialog
            open={!!loginIntent}
            onClose={closeLoginDialog}
            accountName={loginIntent.name}
            profilePath={loginIntent.profilePath}
            onSuccess={handleLoginSuccess}
          />
        )}
      </div>
    );
  }

  const accountBar = (
    <div className="studio-account-bar" data-testid="studio-account-bar">
      <span className="sab-name">
        <i className="ph-fill ph-facebook-logo" />
        {picked.name}
        <span className="session-badge session-valid">Session valid</span>
      </span>
      <button
        type="button"
        data-testid="switch-account-button"
        className="btn-micro"
        onClick={handleSwitch}
      >
        <i className="ph-light ph-arrows-left-right" /> Switch account
      </button>
    </div>
  );

  return (
    <div className="fb-studio-root">
      {viewHeader}
      <StudioFrame
        activeTab={activeTab}
        onTabChange={setActiveTab}
        accountBar={accountBar}
        accountBarName={picked.name}
        onApproveIdea={handleApproveIdea}
        brainContent={
          <FacebookBrain
            prompt={prompt}
            setPrompt={setPrompt}
            profile={profile}
            setProfile={setProfile}
            monetizeType={monetizeType}
            setMonetizeType={setMonetizeType}
            monetizeLink={monetizeLink}
            setMonetizeLink={setMonetizeLink}
            media={media}
            setMedia={setMedia}
            isGenerating={isGenerating}
            status={status}
            onGenerate={handleGenerate}
            onRegenerate={handleRegenerate}
            onDiscard={handleDiscard}
            onPush={handlePushToKanban}
            onSuggestIdeas={handleSuggestIdeas}
            onJumpVideo={handleJumpVideo}
            previewText={previewText}
            showMedia={showMedia}
            feedback={feedback}
            setFeedback={setFeedback}
            previewRef={previewRef}
          />
        }
        kanbanCards={cards}
        crawlSlot={() => <CrawlerPane toast={toast} />}
        automation={automation}
        onToggleSchedule={toggleSchedule}
        onSetCadence={setCadence}
        onToggleAutopilot={toggleAutopilot}
        onAddReplyRule={addReplyRule}
        onDelReplyRule={delReplyRule}
      />
      {loginIntent && (
        <AccountLoginDialog
          open={!!loginIntent}
          onClose={closeLoginDialog}
          accountName={loginIntent.name}
          profilePath={loginIntent.profilePath}
          onSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}

interface CrawledFeed {
  id: string;
  title: string;
  desc: string;
}

// Crawl & Input pane — 2-col bento (Crawl Configuration + Crawled Feeds).
// Browser-sim per DESIGN-DECISIONS (no real API).
function CrawlerPane({ toast }: { toast: ReturnType<typeof useToast> }): React.ReactElement {
  const [target, setTarget] = useState('https://facebook.com/tech_reviewer_vietnam');
  const [feeds, setFeeds] = useState<CrawledFeed[]>([]);
  const [busy, setBusy] = useState(false);

  const runCrawl = useCallback(() => {
    setBusy(true);
    toast.push(`Browser-sim crawler scraping ${target}...`, 'info');
    setTimeout(() => {
      setFeeds((prev) => [
        {
          id: `as${Date.now()}`,
          title: `Scraped media from Facebook (Just now)`,
          desc: `Saved to Asset Library · crawl: ${target}`,
        },
        ...prev,
      ]);
      setBusy(false);
      toast.success('Saved scraped media to Asset Library');
    }, 2000);
  }, [target, toast]);

  return (
    <div className="studio-pane active" id="fb-studio-crawler">
      <div className="bento-grid">
        <div className="bento-card col-span-6 double-bezel">
          <div className="card-inner">
            <h3>Crawl Configuration</h3>
            <div className="form-group">
              <label>Target Page URL / ID</label>
              <input
                type="text"
                className="form-input"
                id="fb-crawl-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={runCrawl}>
              <span>Run Discovery Crawl</span>
            </button>
          </div>
        </div>
        <div className="bento-card col-span-6 double-bezel">
          <div className="card-inner">
            <h3>Crawled Feeds &amp; Source Stream</h3>
            <div className="crawler-list" id="fb-crawler-results">
              {feeds.length === 0 ? (
                <p className="desc">Run a discovery crawl to populate this stream.</p>
              ) : (
                feeds.map((f) => (
                  <div className="crawl-item" key={f.id}>
                    <i className="ph-light ph-rss" />
                    <div className="crawl-item-content">
                      <h5>{f.title}</h5>
                      <p>{f.desc}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FacebookView;
