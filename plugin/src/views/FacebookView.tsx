import React, { useCallback, useState } from 'react';
import { StudioFrame } from './StudioFrame';
import { AccountPickerView } from './AccountPickerView';
import { FormField, PillGroup, PlatformIcon } from '@mdp-private/kit-ui';
import type { AccountCardData, PillOption, KanbanCardData } from '@mdp-private/kit-ui';
import { useToast } from '../components';
import { useFBAccounts } from '../hooks';
import { AccountLoginDialog } from '../tabs/AccountLoginDialog';
import { RepostCrawlSection } from '../tabs/RepostCrawlSection';
import { KanbanTab } from '../tabs/KanbanTab';

const SEED_CARDS: KanbanCardData[] = [
  { id: 'fb-1', title: 'Aula F75 deal roundup', desc: 'Tổng hợp deal bàn phím cơ', status: 'todo', profile: 'Affiliate Tech Page', date: '2026-06-22', platform: 'facebook' },
  { id: 'fb-2', title: 'Silent switch shootout', desc: 'So sánn silent switches 2026', status: 'progress', profile: 'Affiliate Tech Page', date: '2026-06-23', platform: 'facebook' },
  { id: 'fb-3', title: 'GenZ meme keyboard', desc: 'Meme trending keyboard post', status: 'confirm', profile: 'GenZ Viral', date: '2026-06-21', platform: 'facebook' },
];

const PERSONA_OPTIONS: PillOption[] = [
  { value: 'tech', label: 'Tech Reviewer / Affiliate' },
  { value: 'soccer', label: 'Football Trend Master' },
  { value: 'meme', label: 'GenZ Viral Meme Hub' },
];

const MEDIA_OPTIONS: PillOption[] = [
  { value: 'text', label: 'Text Only' },
  { value: 'image', label: 'Generate AI Cover' },
  { value: 'video', label: 'Link AI Video' },
];

interface BrainComposerProps {
  prompt: string;
  setPrompt: (v: string) => void;
  persona: string;
  setPersona: (v: string) => void;
  media: string;
  setMedia: (v: string) => void;
  isGenerating: boolean;
  onCompose: () => void;
  onReset: () => void;
  onPush: () => void;
  previewText: string;
  showMedia: string;
}

function FacebookBrain({
  prompt,
  setPrompt,
  persona,
  setPersona,
  media,
  setMedia,
  isGenerating,
  onCompose,
  onReset,
  onPush,
  previewText,
  showMedia,
}: BrainComposerProps): React.ReactElement {
  return (
    <div className="studio-pane active" data-testid="brain-pane">
      <div className="split-composer">
        <div className="composer-left double-bezel">
          <div className="card-inner">
            <h3>Initiate Idea with AI Brain</h3>

            <FormField
              label="AI Profile Persona"
              type="select"
              value={persona}
              onChange={setPersona}
              options={PERSONA_OPTIONS}
            />

            <FormField
              label="Core Prompt / Seed Idea"
              type="textarea"
              value={prompt}
              onChange={setPrompt}
              placeholder="E.g., Tổng hợp các deal bàn phím cơ hot nhất..."
            />

            <div className="form-group">
              <label>Media Option</label>
              <PillGroup options={MEDIA_OPTIONS} value={media} onChange={setMedia} />
            </div>

            <button
              type="button"
              className="btn btn-primary w-full mt-4"
              disabled={isGenerating}
              onClick={onCompose}
            >
              {isGenerating ? 'Compiling prompt...' : 'Compose Studio'}
            </button>
            <button type="button" className="btn btn-secondary w-full mt-2" onClick={onReset}>
              Reset Composer
            </button>
          </div>
        </div>

        <div className="composer-right double-bezel">
          <div className="card-inner">
            <div className="panel-header-sub">
              <h3>Live Output Preview</h3>
              <span className="preview-status">{isGenerating ? 'Thinking...' : previewText ? 'Ready' : 'Idle'}</span>
            </div>

            <div className="fb-preview-card">
              <div className="fb-preview-header">
                <div className="fb-avatar">
                  <PlatformIcon platform="facebook" size={20} />
                </div>
                <div>
                  <h5>
                    Affiliate Tech Page{' '}
                    <span className="verified-badge">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle' }}>verified</span>
                    </span>
                  </h5>
                  <span>Just now · Simulated Preview</span>
                </div>
              </div>
              <div className="fb-preview-body">
                {isGenerating ? (
                  <span className="media-loader">AI Brain compiling prompts...</span>
                ) : previewText ? (
                  <p style={{ whiteSpace: 'pre-wrap' }}>{previewText}</p>
                ) : (
                  <p className="placeholder-text">
                    Output will appear here once AI Brain generates the draft...
                  </p>
                )}
              </div>
              {showMedia === 'image' && (
                <div className="fb-preview-media">
                  <img
                    src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80"
                    alt="AI B-Roll"
                    style={{ width: '100%', borderRadius: '8px' }}
                  />
                </div>
              )}
              {showMedia === 'video' && (
                <div className="fb-preview-media">
                  <div className="media-loader" style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff', borderRadius: '8px' }}>
                    <span className="material-symbols-outlined" style={{ marginRight: '8px' }}>play_circle</span>
                    Simulated Video Stream Active
                  </div>
                </div>
              )}
              <div className="fb-preview-footer">
                <span>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>thumb_up</span>
                  Like
                </span>
                <span>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>chat_bubble</span>
                  Comment
                </span>
                <span>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>share</span>
                  Share
                </span>
              </div>
            </div>

            {previewText && !isGenerating && (
              <div style={{ marginTop: '16px' }}>
                <button type="button" className="btn btn-primary w-full" onClick={onPush}>
                  Push to Kanban
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
  // The picker gate. Null = no account picked yet → render the
  // picker view. Once picked, the user enters StudioFrame for the
  // rest of the session. Reloading the tab resets the gate (per
  // product spec: "Luôn hiện").
  const [picked, setPicked] = useState<AccountCardData | null>(null);
  // Login dialog state — opened when the user clicks the "+ account"
  // tile on the picker. We track an intent object so the dialog
  // knows which profilePath/email to suggest.
  const [loginIntent, setLoginIntent] = useState<{ name: string } | null>(null);
  const toast = useToast();

  const [prompt, setPrompt] = useState('');
  const [persona, setPersona] = useState('tech');
  const [media, setMedia] = useState('text');
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [showMedia, setShowMedia] = useState('none');

  const handleCompose = () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setPreviewText('');
    setShowMedia('none');

    setTimeout(() => {
      let output = '';
      if (persona === 'tech') {
        output = `🔥 DEAL BÀN PHÍM CƠ HOT NHẤT HÔM NAY 🔥\n\nAula F75 Silent - chiếc bàn phím êm ái nhất năm nay đã lên kệ với giá ưu đãi cực sốc cho anh em cú đêm. Giá chỉ còn 890k tại link bio! #MechanicalKeyboard #Affiliate`;
      } else if (persona === 'soccer') {
        output = `⚽ AI Brain dự đoán tỷ số tối nay! Trận cầu nảy lửa với phân tích dữ liệu chuyên sâu từ mô hình AI. Anh em click bio xem ngay nhận định kèo thơm. #Football #Predictions`;
      } else {
        output = `Lập trình viên 2026 gõ code silent Aula F75. Click giỏ hàng mua ngay! #Affiliate #TikTokShop #Coding`;
      }

      setPreviewText(output);
      setShowMedia(media);
      setIsGenerating(false);
    }, 1000);
  };

  const handleReset = () => {
    setPrompt('');
    setPreviewText('');
    setShowMedia('none');
  };

  const handlePushToKanban = () => {
    if (!previewText) return;
    const newCard: KanbanCardData = {
      id: `k-${Date.now()}`,
      title: previewText.split('\n')[0].substring(0, 32) + '...',
      desc: previewText,
      platform: 'facebook',
      status: 'todo',
      profile: persona === 'tech' ? 'Affiliate Tech' : 'Trend Master',
      date: 'Just now',
    };

    setCards((prev) => [newCard, ...prev]);
    handleReset();
    setActiveTab('kanban');
  };

  const handleGoToCrawl = () => {
    setActiveTab('crawl');
  };

  const handleDraftsReady = (_feedIds: string[]) => {
    toast.success('Đã generate drafts — mở tab Kanban để xem.');
  };

  const handleOpenBrainFeed = React.useCallback(() => setActiveTab('brain-feed'), []);

  // RepostCrawlSection needs real account/group lists to drive its
  // crawl form. The schedule modal is self-contained now (it
  // dispatches `mdp:open-kanban` so we switch the tab from here).
  const { data: accounts, reload: reloadAccounts } = useFBAccounts();

  // Bridge for legacy mounts of <RepostCrawlSection /> (e.g. inside
  // RepostTab) where the parent can't easily pass onOpenBrainFeed down.
  // The crawl section's "Mở Brain Feed" chip dispatches this event;
  // we listen here and switch to the Brain Feed tab.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setActiveTab('brain-feed');
    window.addEventListener('mdp:open-brain-feed', handler);
    return () => window.removeEventListener('mdp:open-brain-feed', handler);
  }, []);

  // SchedulePostModal dispatches mdp:open-kanban when the user hits OK;
  // we listen and switch the active tab to the new Kanban so they can
  // watch the slots get published.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setActiveTab('kanban');
    window.addEventListener('mdp:open-kanban', handler);
    return () => window.removeEventListener('mdp:open-kanban', handler);
  }, []);

  const handlePick = useCallback((a: AccountCardData) => {
    setPicked(a);
  }, []);

  const handleAdd = useCallback(() => {
    setLoginIntent({ name: '' });
  }, []);

  const handleLoginSuccess = useCallback(() => {
    // Refresh the picker list so the new account shows up, and
    // close the dialog. The user can re-pick (or stay on the dialog
    // for another add — flow is up to them).
    reloadAccounts();
    setLoginIntent(null);
  }, [reloadAccounts]);

  // Pre-picker gate. The shell renders the eyebrow + h1 header above
  // this — we only own the picker grid + add tile.
  if (!picked) {
    return (
      <>
        <AccountPickerView
          onPick={handlePick}
          onAdd={handleAdd}
        />
        {loginIntent && (
          <AccountLoginDialog
            open={!!loginIntent}
            onClose={() => setLoginIntent(null)}
            accountName={loginIntent.name}
            onSuccess={handleLoginSuccess}
          />
        )}
      </>
    );
  }

  return (
    <>
      <StudioFrame
        activeTab={activeTab}
        onTabChange={setActiveTab}
        brainContent={
          <FacebookBrain
            prompt={prompt}
            setPrompt={setPrompt}
            persona={persona}
            setPersona={setPersona}
            media={media}
            setMedia={setMedia}
            isGenerating={isGenerating}
            onCompose={handleCompose}
            onReset={handleReset}
            onPush={handlePushToKanban}
            previewText={previewText}
            showMedia={showMedia}
          />
        }
        kanbanCards={cards}
        onGoToCrawl={handleGoToCrawl}
        onDraftsReady={handleDraftsReady}
        onOpenBrainFeed={handleOpenBrainFeed}
        crawlSlot={({ onOpenBrainFeed: slotOpenBrainFeed }) => (
          <RepostCrawlSection
            accounts={accounts}
            onOpenBrainFeed={slotOpenBrainFeed}
          />
        )}
        kanbanSlot={() => <KanbanTab />}
      />
      {/* Login dialog (kept mounted after pick so user can still add
          another account via the existing account-management UI
          without leaving the studio). */}
      {loginIntent && (
        <AccountLoginDialog
          open={!!loginIntent}
          onClose={() => setLoginIntent(null)}
          accountName={loginIntent.name}
          onSuccess={handleLoginSuccess}
        />
      )}
    </>
  );
}

export default FacebookView;
