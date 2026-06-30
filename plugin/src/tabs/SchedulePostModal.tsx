/**
 * SchedulePostModal — opens after the user clicks "Tạo lịch đăng (N)"
 * on the Crawl tab. Shows N auto-filled time slots (default 4h spacing
 * from now) and a persona dropdown. On OK:
 *
 *   1. POST /brain/generate-and-schedule with the N feed ids + persona +
 *      N slots.
 *   2. Backend generates a draft per slot via mdp-brain, schedules each
 *      for /me publishing, and binds kanban_job_id.
 *   3. We toast + fire `mdp:open-kanban` so the Kanban tab takes focus.
 *
 * Per-slot failures stay on the modal so the user sees what went wrong
 * instead of a silent miss.
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
  feedIds: string[];
  /** SHA-1 v5 UUID of the kit account (resolved from useFBAccounts[0]). */
  accountId: string;
  onCreated?: (res: GenerateAndScheduleResponse) => void;
}

interface Slot {
  /** YYYY-MM-DDTHH:mm in local time; converted to ISO UTC on submit. */
  localDateTime: string;
}

const HOUR = 60 * 60 * 1000;
const DEFAULT_SPACING_MS = 4 * HOUR;

/** Build a YYYY-MM-DDTHH:mm string in local time from a Date. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SchedulePostModal: React.FC<SchedulePostModalProps> = ({
  open,
  onClose,
  feedIds,
  accountId,
  onCreated,
}) => {
  const { personas, loading: personasLoading } = useBrainPersonas({ accountId });
  const [personaId, setPersonaId] = useState<string>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [failures, setFailures] = useState<GenerateAndScheduleResponse['failures']>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset state each time the modal opens.
  useEffect(() => {
    if (!open) return;
    const base = Date.now() + DEFAULT_SPACING_MS; // first slot = +4h
    setSlots(
      feedIds.map((_, i) => ({
        localDateTime: toLocalInput(new Date(base + i * DEFAULT_SPACING_MS)),
      }))
    );
    setPersonaId(personas[0]?.id ?? '');
    setFailures([]);
    setError(null);
  }, [open, feedIds.length, personas]);

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
    if (slots.length === 0 || feedIds.length === 0) {
      setError('Cần ít nhất 1 bài + 1 khung giờ');
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
    setSubmitting(true);
    setError(null);
    setFailures([]);
    try {
      const res = await scheduleApi.generateAndSchedule({
        feedIds,
        personaId,
        accountId,
        slots: slots.map((s) => ({ scheduledAt: new Date(s.localDateTime).toISOString() })),
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
  }, [slots, feedIds, personaId, accountId, onCreated, onClose]);

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={`Tạo lịch đăng (${feedIds.length})`}
      size="lg"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={submitting || slots.length === 0}>
            {submitting ? 'Đang lên lịch…' : 'Lên lịch'}
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

        <div className="schedule-modal__slots">
          <div className="schedule-modal__slots-header">
            Khung giờ đăng (cách nhau 4h, có thể chỉnh)
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
                  {f.feedId} — {f.stage}: {f.message}
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