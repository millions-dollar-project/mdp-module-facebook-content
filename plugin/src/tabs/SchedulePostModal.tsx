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
 *   3. Time of the first post (HH:mm, GMT+7 wall clock) and the
 *      spacing between posts (minutes, default 60). The modal shows
 *      the resolved timestamps so the user sees what they're signing
 *      up for before submit.
 *
 * On submit:
 *
 *   1. POST /brain/generate-and-schedule with numDrafts + model id +
 *      accountId + N ISO-UTC slots (today in GMT+7, +intervalMin each).
 *   2. Backend generates K drafts, schedules each at the matching
 *      slot, binds kanban_job_id.
 *   3. We fire `mdp:open-kanban` so the Kanban tab takes focus.
 *
 * "Đăng ngay khi AI xong" override: when checked, the slot times are
 * ignored and the backend stamps every row with now() (see
 * brain_schedule.go publishImmediately branch). The 60s worker tick
 * then publishes them.
 *
 * Per-slot failures stay on the modal so the user sees what went
 * wrong instead of a silent miss.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { Input } from '../components/Input';
import { useBrainAIModels } from '../hooks/useBrainAIModels';
import { scheduleApi, type GenerateAndScheduleResponse } from '../lib/api/scheduled';
import { fromGmt7DateTimeInput, toGmt7DateTimeInput } from '../lib/time';

const MIN_DRAFTS = 1;
const MAX_DRAFTS = 50;
const DEFAULT_DRAFTS = 3;
const DEFAULT_INTERVAL_MIN = 60;
// 30s grace so the worker has time to publish the now() slot before
// the in-memory past-check rejects it (matches service.EnsureFuture).
const MIN_INTERVAL_MIN = 1;
const MAX_INTERVAL_MIN = 24 * 60;

/** HH:mm in GMT+7, e.g. "19:08". Defaults to 1h from now in GMT+7. */
function defaultTime(): string {
  return toGmt7DateTimeInput(new Date(Date.now() + 60 * 60 * 1000)).slice(11, 16);
}

/** Clamp a draft count into the 1..50 range the backend accepts. */
function clampDrafts(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DRAFTS;
  return Math.max(MIN_DRAFTS, Math.min(MAX_DRAFTS, Math.trunc(n)));
}

/** Clamp interval to a sane range. 0 or NaN → default. */
function clampInterval(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MIN;
  return Math.max(MIN_INTERVAL_MIN, Math.min(MAX_INTERVAL_MIN, Math.trunc(n)));
}

/**
 * Build the N slot ISO timestamps from a wall-clock start time +
 * interval. Slots are anchored to TODAY in GMT+7; if the start time
 * is already in the past we bump the anchor to tomorrow so the
 * user never sees "lúc 03:00 sáng nay" surprises.
 */
function buildSlots(dailyTime: string, intervalMin: number, n: number): Date[] {
  const todayGmt7 = toGmt7DateTimeInput(new Date()).slice(0, 10);
  const base = fromGmt7DateTimeInput(`${todayGmt7}T${dailyTime}`);
  if (base.getTime() <= Date.now()) {
    base.setUTCDate(base.getUTCDate() + 1);
  }
  const out: Date[] = [];
  for (let i = 0; i < n; i++) {
    out.push(new Date(base.getTime() + i * intervalMin * 60 * 1000));
  }
  return out;
}

/** Render HH:mm in GMT+7 from a UTC Date, used in the preview line. */
function formatPreviewTime(d: Date): string {
  return toGmt7DateTimeInput(d).slice(11, 16);
}

/** Short Vietnamese date label for "07/02" style display. */
function formatPreviewDate(d: Date): string {
  const gmt7 = toGmt7DateTimeInput(d);
  return gmt7.slice(5, 7) + '/' + gmt7.slice(8, 10);
}

export interface SchedulePostModalProps {
  open: boolean;
  onClose: () => void;
  /** SHA-1 v5 UUID of the kit account (resolved from useFBAccounts[0]). */
  accountId: string;
  onCreated?: (res: GenerateAndScheduleResponse) => void;
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
  const [dailyTime, setDailyTime] = useState<string>(defaultTime);
  const [intervalMin, setIntervalMin] = useState<number>(DEFAULT_INTERVAL_MIN);
  const [publishImmediately, setPublishImmediately] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failures, setFailures] = useState<GenerateAndScheduleResponse['failures']>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset state each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setNumDrafts(DEFAULT_DRAFTS);
    setDailyTime(defaultTime());
    setIntervalMin(DEFAULT_INTERVAL_MIN);
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

  const setDraftCount = useCallback((next: number) => {
    setNumDrafts(clampDrafts(next));
  }, []);

  const setInterval = useCallback((next: number) => {
    setIntervalMin(clampInterval(next));
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

  // Preview = the resolved timestamps, refreshed every minute so the
  // "Đã qua" rollover (buildSlots bumps base to tomorrow) updates
  // without a manual re-open. Cheap — just Date arithmetic.
  const previewSlots = useMemo(() => {
    if (publishImmediately) return [];
    return buildSlots(dailyTime, intervalMin, numDrafts);
  }, [dailyTime, intervalMin, numDrafts, publishImmediately, open]);

  const submit = useCallback(async () => {
    if (!modelId) {
      setError('Chọn 1 AI model trước');
      return;
    }
    if (!accountId) {
      setError('Chưa chọn kit account');
      return;
    }
    setSubmitting(true);
    setError(null);
    setFailures([]);
    try {
      let slots: { scheduledAt: string }[];
      if (publishImmediately) {
        // Slot times are unused server-side; backend stamps now() for
        // every entry. We still need a well-formed array of length
        // numDrafts.
        const nowIso = new Date().toISOString();
        slots = Array.from({ length: numDrafts }, () => ({ scheduledAt: nowIso }));
      } else {
        slots = previewSlots.map((d) => ({ scheduledAt: d.toISOString() }));
        // Belt-and-braces: if all preview slots are still in the past
        // (user picked a wall-clock time while the modal was open
        // and the wall crossed it), bail before the backend's 400.
        if (slots.every((s) => new Date(s.scheduledAt).getTime() <= Date.now())) {
          setError('Giờ đăng đã qua — chọn giờ khác hoặc tick "Đăng ngay"');
          setSubmitting(false);
          return;
        }
      }
      const res = await scheduleApi.generateAndSchedule({
        numDrafts,
        modelId,
        accountId,
        slots,
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
  }, [previewSlots, numDrafts, modelId, accountId, onCreated, onClose, publishImmediately]);

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title="Tạo bài từ crawl"
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={submitting || !modelId}>
            {submitting
              ? 'Đang tạo bài…'
              : publishImmediately
              ? `Tạo & đăng ${numDrafts} bài`
              : `Tạo ${numDrafts} bài`}
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
            Số lượng bài
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
          Sẽ tạo <strong>{numDrafts}</strong> bài mới dùng {numDrafts} feeds
          mới nhất làm style context.
        </div>

        <fieldset className="schedule-modal__schedule" disabled={submitting}>
          <div className="schedule-modal__row schedule-modal__row--inline">
            <label className="schedule-modal__label" htmlFor="daily-time-input">
              Giờ đăng bài đầu (GMT+7)
            </label>
            <Input
              id="daily-time-input"
              type="time"
              value={dailyTime}
              onChange={(e) => setDailyTime(e.target.value)}
            />
          </div>
          <div className="schedule-modal__row schedule-modal__row--inline">
            <label className="schedule-modal__label" htmlFor="interval-input">
              Cách nhau (phút)
            </label>
            <Input
              id="interval-input"
              type="number"
              min={MIN_INTERVAL_MIN}
              max={MAX_INTERVAL_MIN}
              step={1}
              value={intervalMin}
              onChange={(e) => setInterval(Number(e.target.value))}
              onBlur={(e) => setInterval(Number(e.target.value))}
            />
          </div>
          {!publishImmediately && previewSlots.length > 0 && (
            <div className="schedule-modal__preview" aria-label="Danh sách giờ đăng">
              {previewSlots.map((d, i) => (
                <span key={i} className="schedule-modal__chip">
                  #{i + 1} {formatPreviewDate(d)} {formatPreviewTime(d)}
                </span>
              ))}
            </div>
          )}
        </fieldset>

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
              Worker pick bài trong vòng 60s, đăng lên trang cá nhân qua Playwright.
              Bỏ qua khung giờ ở trên.
            </small>
          </span>
        </label>

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