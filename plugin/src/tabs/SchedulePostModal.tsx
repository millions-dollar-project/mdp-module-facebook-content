/**
 * SchedulePostModal — opens after a successful crawl.
 *
 * The user just crawled N posts into AI brain. The modal asks:
 *
 *   1. AI model (which provider the brain uses — gpt-4o, claude, …)
 *   2. How many drafts to CREATE (1..50, default 3) — the AI
 *      generates this many NEW posts, not N drafts of existing
 *      crawled content. The top-N newest feeds from brain_feeds
 *      are used as style context.
 *   3. Custom time per draft (no auto-spacing — the user picks
 *      free-form, e.g. 10:01, 10:02, 14:30 on the same day).
 *
 * On submit:
 *
 *   1. POST /brain/generate-and-schedule with numDrafts + model id +
 *      accountId + N slots.
 *   2. Backend generates K drafts, schedules each at the matching
 *      slot, binds kanban_job_id.
 *   3. We toast + fire `mdp:open-kanban` so the Kanban tab takes
 *      focus.
 *
 * Per-slot failures stay on the modal so the user sees what went
 * wrong instead of a silent miss.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { useBrainAIModels } from '../hooks/useBrainAIModels';
import { scheduleApi, type GenerateAndScheduleResponse } from '../lib/api/scheduled';

const MIN_DRAFTS = 1;
const MAX_DRAFTS = 50;
const DEFAULT_DRAFTS = 3;

export interface SchedulePostModalProps {
  open: boolean;
  onClose: () => void;
  /** SHA-1 v5 UUID of the kit account (resolved from useFBAccounts[0]). */
  accountId: string;
  onCreated?: (res: GenerateAndScheduleResponse) => void;
}

interface Slot {
  /** YYYY-MM-DDTHH:mm in local time; converted to ISO UTC on submit. */
  localDateTime: string;
}

const HOUR = 60 * 60 * 1000;

/** Build a YYYY-MM-DDTHH:mm string in local time from a Date. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Default first-slot time = +1h from now (so it's always in the
 *  future regardless of timezone quirks). Subsequent slots default
 *  to empty — the user types whatever they want. */
function defaultFirstSlot(): string {
  return toLocalInput(new Date(Date.now() + HOUR));
}

/** Build N slot rows. Only the first gets a default time; the rest
 *  start blank. When the user shrinks the list, blank/empty rows
 *  are dropped first so typing is never silently thrown away. */
function buildSlots(n: number, prev: Slot[] = []): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < n; i++) {
    if (prev[i]?.localDateTime) {
      out.push({ localDateTime: prev[i].localDateTime });
    } else if (i === 0) {
      out.push({ localDateTime: defaultFirstSlot() });
    } else {
      out.push({ localDateTime: '' });
    }
  }
  return out;
}

/** Clamp a draft count into the 1..50 range the backend accepts. */
function clampDrafts(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DRAFTS;
  return Math.max(MIN_DRAFTS, Math.min(MAX_DRAFTS, Math.trunc(n)));
}

export const SchedulePostModal: React.FC<SchedulePostModalProps> = ({
  open,
  onClose,
  accountId,
  onCreated,
}) => {
  const { models, loading: modelsLoading } = useBrainAIModels({ accountId });
  const [modelId, setModelId] = useState<string>('');
  const [numDrafts, setNumDrafts] = useState<number>(DEFAULT_DRAFTS);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [publishImmediately, setPublishImmediately] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failures, setFailures] = useState<GenerateAndScheduleResponse['failures']>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset state each time the modal opens. The slot list always
  // starts fresh because there's no meaningful user input to
  // preserve across re-opens (the previous schedule is already in
  // the Kanban).
  useEffect(() => {
    if (!open) return;
    setNumDrafts(DEFAULT_DRAFTS);
    setSlots(buildSlots(DEFAULT_DRAFTS));
    setPublishImmediately(false);
    setFailures([]);
    setError(null);
  }, [open]);

  // Default the model to the first entry once it loads. Don't
  // overwrite a user selection.
  useEffect(() => {
    if (!modelId && models.length > 0) {
      setModelId(models[0].id);
    }
  }, [models, modelId]);

  const updateSlot = useCallback((idx: number, value: string) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { localDateTime: value } : s)));
  }, []);

  const setDraftCount = useCallback((next: number) => {
    const clamped = clampDrafts(next);
    setNumDrafts(clamped);
    setSlots((prev) => buildSlots(clamped, prev));
  }, []);

  // Defensive: even though `useBrainAIModels` now normalizes to `[]`,
  // the modal also exposes this defensively in case the hook is fed
  // an alternate shape from a future backend. Prevents
  // "Cannot read properties of undefined (reading 'map')" at render.
  const modelOptions = useMemo(
    () =>
      (models ?? []).map((m) => ({
        value: m.id,
        label: m.label,
      })),
    [models]
  );

  const submit = useCallback(async () => {
    if (slots.length === 0) {
      setError('Cần ít nhất 1 khung giờ');
      return;
    }
    if (!modelId) {
      setError('Chọn 1 AI model trước');
      return;
    }
    if (!accountId) {
      setError('Chưa chọn kit account');
      return;
    }
    // Validate every slot has a parseable future time. The backend
    // rejects past times with 400, but we catch obvious blanks here
    // so the user doesn't have to round-trip. Skipped entirely when
    // publishImmediately is set — the backend stamps now() and the
    // slot times are ignored.
    const parsedSlots: { scheduledAt: string }[] = [];
    if (!publishImmediately) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s.localDateTime) {
          setError(`Ô giờ #${i + 1} đang trống`);
          return;
        }
        const d = new Date(s.localDateTime);
        if (Number.isNaN(d.getTime())) {
          setError(`Ô giờ #${i + 1} không hợp lệ`);
          return;
        }
        if (d.getTime() <= Date.now()) {
          setError(`Ô giờ #${i + 1} đã qua`);
          return;
        }
        parsedSlots.push({ scheduledAt: d.toISOString() });
      }
    } else {
      // Slot times are unused server-side but we still need a
      // well-formed array of length numDrafts. Backend overrides
      // every entry with time.Now().
      for (let i = 0; i < slots.length; i++) {
        parsedSlots.push({ scheduledAt: new Date().toISOString() });
      }
    }
    setSubmitting(true);
    setError(null);
    setFailures([]);
    try {
      const res = await scheduleApi.generateAndSchedule({
        numDrafts: parsedSlots.length,
        modelId,
        accountId,
        slots: parsedSlots,
        publishImmediately,
      });
      if (res.failures?.length) {
        setFailures(res.failures);
      }
      onCreated?.(res);
      // Fire-and-forget the kanban tab switch. The listener lives on
      // FacebookView (see mdp:open-kanban wiring).
      window.dispatchEvent(new CustomEvent('mdp:open-kanban'));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [slots, modelId, accountId, onCreated, onClose, publishImmediately]);

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title="Tạo bài từ crawl"
      size="lg"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={submitting || slots.length === 0}>
            {submitting ? 'Đang tạo bài…' : `Tạo ${slots.length} bài`}
          </Button>
        </div>
      }
    >
      <div className="schedule-modal">
        <div className="schedule-modal__row">
          <label className="schedule-modal__label" htmlFor="model-select">
            AI model
          </label>
          <Select
            id="model-select"
            options={modelOptions}
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={modelsLoading || submitting}
            placeholder={modelsLoading ? 'Đang tải…' : 'Chọn AI model'}
          />
        </div>

        <div className="schedule-modal__row schedule-modal__row--inline">
          <label className="schedule-modal__label" htmlFor="num-drafts-input">
            Số lượng bài ({MIN_DRAFTS}..{MAX_DRAFTS})
          </label>
          <div className="schedule-modal__num-drafts">
            <button
              type="button"
              className="schedule-modal__step"
              onClick={() => setDraftCount(numDrafts - 1)}
              disabled={submitting || numDrafts <= MIN_DRAFTS}
              aria-label="Giảm số bài"
            >
              −
            </button>
            <input
              id="num-drafts-input"
              type="number"
              className="fb-input schedule-modal__num-input"
              value={numDrafts}
              min={MIN_DRAFTS}
              max={MAX_DRAFTS}
              step={1}
              disabled={submitting}
              onChange={(e) => setDraftCount(Number(e.target.value))}
              onBlur={(e) => setDraftCount(Number(e.target.value))}
            />
            <button
              type="button"
              className="schedule-modal__step"
              onClick={() => setDraftCount(numDrafts + 1)}
              disabled={submitting || numDrafts >= MAX_DRAFTS}
              aria-label="Tăng số bài"
            >
              +
            </button>
          </div>
        </div>

        <div className="schedule-modal__count">
          <span>
            Sẽ tạo <strong>{slots.length}</strong> bài mới dùng <strong>{slots.length}</strong> feeds
            mới nhất làm style context.
          </span>
        </div>

        <div className="schedule-modal__slots">
          <div className="schedule-modal__slots-header">
            Khung giờ đăng (tự nhập — không tự động cách nhau)
          </div>
          <ul className="schedule-modal__slot-list">
            {(slots ?? []).map((s, i) => (
              <li key={i} className="schedule-modal__slot-item">
                <span className="schedule-modal__slot-idx">#{i + 1}</span>
                <input
                  type="datetime-local"
                  className="fb-input"
                  value={s.localDateTime}
                  onChange={(e) => updateSlot(i, e.target.value)}
                  disabled={submitting || publishImmediately}
                  placeholder="10:01 14/07/2026"
                />
              </li>
            ))}
          </ul>
          <label className="schedule-modal__autopost">
            <input
              type="checkbox"
              checked={publishImmediately}
              onChange={(e) => setPublishImmediately(e.target.checked)}
              disabled={submitting}
              data-testid="publish-immediately-checkbox"
            />
            <span>
              Đăng ngay khi AI xong
              <small>
                Worker sẽ pick bài trong vòng 60s và đăng lên trang cá nhân qua Playwright.
              </small>
            </span>
          </label>
        </div>

        {failures.length > 0 && (
          <div className="schedule-modal__failures">
            <strong>{failures.length} lỗi:</strong>
            <ul>
              {(failures ?? []).map((f, i) => (
                <li key={i}>
                  Ô #{f.index + 1} — {f.stage}: {f.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <div className="schedule-modal__error">{error}</div>}
      </div>
    </Modal>
  );
};

export default SchedulePostModal;
