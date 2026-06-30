/**
 * SchedulePostModal — opens after a successful crawl.
 *
 * The user just crawled N posts into AI brain. The modal asks:
 *
 *   1. Persona (which AI voice to use)
 *   2. How many drafts to CREATE (1..50, default 3) — the AI
 *      generates this many NEW posts, not N drafts of existing
 *      crawled content. The top-N newest feeds from brain_feeds
 *      are used as style context.
 *   3. Custom time per draft (no auto-spacing — the user picks
 *      free-form, e.g. 10:01, 10:02, 14:30 on the same day).
 *
 * On submit:
 *
 *   1. POST /brain/generate-and-schedule with numDrafts + persona +
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
import { useBrainPersonas } from '../hooks/useBrainPersonas';
import { scheduleApi, type GenerateAndScheduleResponse } from '../lib/api/scheduled';

export interface SchedulePostModalProps {
  open: boolean;
  onClose: () => void;
  /** How many new drafts to ask the AI for. 1..50. */
  numDrafts: number;
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

export const SchedulePostModal: React.FC<SchedulePostModalProps> = ({
  open,
  onClose,
  numDrafts,
  accountId,
  onCreated,
}) => {
  const { personas, loading: personasLoading } = useBrainPersonas({ accountId });
  const [personaId, setPersonaId] = useState<string>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [failures, setFailures] = useState<GenerateAndScheduleResponse['failures']>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset state each time the modal opens or the requested count
  // changes. Build N empty slot rows (all but the first start blank
  // so the user types custom times — we do NOT auto-space).
  useEffect(() => {
    if (!open) return;
    const n = Math.max(1, Math.min(50, numDrafts));
    const next: Slot[] = Array.from({ length: n }, (_, i) => ({
      localDateTime: i === 0 ? defaultFirstSlot() : '',
    }));
    setSlots(next);
    setPersonaId(personas[0]?.id ?? '');
    setFailures([]);
    setError(null);
  }, [open, numDrafts, personas]);

  const updateSlot = useCallback((idx: number, value: string) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { localDateTime: value } : s)));
  }, []);

  const personaOptions = useMemo(
    () =>
      personas.map((p) => ({
        value: p.id,
        label: p.id,
      })),
    [personas]
  );

  const submit = useCallback(async () => {
    if (slots.length === 0) {
      setError('Cần ít nhất 1 khung giờ');
      return;
    }
    if (!personaId) {
      setError('Chọn 1 persona trước');
      return;
    }
    if (!accountId) {
      setError('Chưa chọn kit account');
      return;
    }
    // Validate every slot has a parseable time. The backend rejects
    // past times with 400, but we catch the obvious "user left the
    // field blank" case here so the user doesn't have to wait for
    // the round trip.
    const parsedSlots: { scheduledAt: string }[] = [];
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
    setSubmitting(true);
    setError(null);
    setFailures([]);
    try {
      const res = await scheduleApi.generateAndSchedule({
        numDrafts: parsedSlots.length,
        personaId,
        accountId,
        slots: parsedSlots,
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
  }, [slots, personaId, accountId, onCreated, onClose]);

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
          <label className="schedule-modal__label" htmlFor="persona-select">
            Persona
          </label>
          <Select
            id="persona-select"
            options={personaOptions}
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            disabled={personasLoading || submitting}
            placeholder={personasLoading ? 'Đang tải…' : 'Chọn persona'}
          />
        </div>

        <div className="schedule-modal__count">
          <span>
            Số lượng bài: <strong>{slots.length}</strong> (top {slots.length} feeds
            mới nhất sẽ làm style context cho AI)
          </span>
        </div>

        <div className="schedule-modal__slots">
          <div className="schedule-modal__slots-header">
            Khung giờ đăng (tự nhập — không tự động cách nhau)
          </div>
          <ul className="schedule-modal__slot-list">
            {slots.map((s, i) => (
              <li key={i} className="schedule-modal__slot-item">
                <span className="schedule-modal__slot-idx">#{i + 1}</span>
                <input
                  type="datetime-local"
                  className="fb-input"
                  value={s.localDateTime}
                  onChange={(e) => updateSlot(i, e.target.value)}
                  disabled={submitting}
                  placeholder="10:01 14/07/2026"
                />
              </li>
            ))}
          </ul>
        </div>

        {failures.length > 0 && (
          <div className="schedule-modal__failures">
            <strong>{failures.length} lỗi:</strong>
            <ul>
              {failures.map((f, i) => (
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
