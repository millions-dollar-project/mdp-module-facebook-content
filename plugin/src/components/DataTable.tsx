import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useToast } from './Toast';

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<DataTableColumn<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T) => string;
  emptyState?: React.ReactNode;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
  size?: 'sm' | 'md';
  /**
   * When provided, the table renders a leading checkbox column, a
   * bulk-action bar above the table, and a confirm dialog before
   * invoking the callback. The callback receives the array of row
   * ids that the user selected. Internal selection state is cleared
   * when the promise resolves successfully and preserved (scoped to
   * failed ids) when it rejects with a partial failure.
   */
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
  /**
   * Fired with the current selection ids whenever the user toggles
   * a checkbox. When provided, the DataTable skips its internal
   * bulk-action bar and confirm modal — the consumer is expected to
   * render them in a positioned ancestor (e.g. a section bar). The
   * consumer is then responsible for calling `onBulkDelete` from
   * their own confirm handler.
   */
  onSelectionChange?: (selectedIds: readonly string[]) => void;
  /** Label for the delete action button. Defaults to "Xóa". */
  bulkDeleteLabel?: string;
  /**
   * Body of the confirm dialog. Receives the number of selected
   * rows so the consumer can warn about cascade / orphan effects
   * (e.g. account deletion cascading to repost_jobs). Defaults to a
   * generic "Mục đã chọn sẽ bị xoá." message.
   */
  confirmMessage?: (count: number) => React.ReactNode;
  /** Title of the confirm dialog. Defaults to "Xoá mục đã chọn?". */
  confirmTitle?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyState,
  loading = false,
  onRowClick,
  rowClassName,
  className,
  size = 'md',
  onBulkDelete,
  onSelectionChange,
  bulkDeleteLabel = 'Xóa',
  confirmMessage,
  confirmTitle = 'Xoá mục đã chọn?',
}: DataTableProps<T>) {
  const toast = useToast();
  const selectable = typeof onBulkDelete === 'function';
  // When onSelectionChange is provided the consumer owns the bulk
  // bar / confirm modal — DataTable just exposes its selection
  // state and still does the delete.
  const externalMode = selectable && !!onSelectionChange;
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Mirror the selection up to the consumer whenever it changes.
  React.useEffect(() => {
    onSelectionChange?.(Array.from(selected));
  }, [selected, onSelectionChange]);

  // Prune selection to ids that still exist in the row set so a
  // reload (or row deletion upstream) does not leave us with a
  // checked set that points at nothing.
  React.useEffect(() => {
    if (!selectable) return;
    setSelected((cur) => {
      if (cur.size === 0) return cur;
      const live = new Set(rows.map(rowKey));
      let changed = false;
      const next = new Set<string>();
      cur.forEach((id) => {
        if (live.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : cur;
    });
  }, [rows, rowKey, selectable]);

  const allChecked = selectable && rows.length > 0 && selected.size === rows.length;
  const someChecked = selectable && selected.size > 0 && !allChecked;

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(rowKey)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleConfirm = async () => {
    if (!onBulkDelete) return;
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      await onBulkDelete(ids);
      setSelected(new Set());
      setConfirming(false);
    } catch (err) {
      // Keep the dialog closed on error; toast surfaces the message.
      // Re-open nothing — the consumer is responsible for partial
      // failure UX (i.e. keeping failed ids selected if it wants).
      toast.error(`Lỗi: ${(err as Error).message}`);
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className={['fb-table', 'fb-table--loading', className ?? ''].filter(Boolean).join(' ')}>
        <div className="fb-table__spinner" />
        <p>Đang tải…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={['fb-table', 'fb-table--empty', className ?? ''].filter(Boolean).join(' ')}>
        {emptyState ?? <p>Không có dữ liệu.</p>}
      </div>
    );
  }

  const renderInternalBar = selectable && !externalMode;

  return (
    <div className={['fb-table', `fb-table--${size}`, className ?? ''].filter(Boolean).join(' ')}>
      {renderInternalBar && selected.size > 0 && (
        <div className="fb-table__select-bar" role="region" aria-label="Bulk actions">
          <span className="fb-table__select-count">Đã chọn {selected.size}</span>
          <div className="fb-table__select-actions">
            <Button variant="ghost" onClick={clearSelection} disabled={deleting}>
              Bỏ chọn
            </Button>
            <Button
              variant="danger"
              onClick={() => setConfirming(true)}
              disabled={deleting}
            >
              {bulkDeleteLabel} ({selected.size})
            </Button>
          </div>
        </div>
      )}
      <table>
        <thead>
          <tr>
            {selectable && (
              <th className="fb-table__check" data-align="center" aria-label="Select all">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={toggleAll}
                  aria-label="Chọn tất cả"
                />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={c.className}
                data-align={c.align ?? 'left'}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const k = rowKey(row);
            const isSelected = selected.has(k);
            const cls = [
              onRowClick ? 'fb-table__row--clickable' : '',
              rowClassName?.(row) ?? '',
              isSelected ? 'fb-table__row--selected' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr
                key={k}
                className={cls}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {selectable && (
                  <td
                    className="fb-table__check"
                    data-align="center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(k)}
                      aria-label="Chọn hàng"
                    />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} data-align={c.align ?? 'left'} className={c.className}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {renderInternalBar && (
        <Modal
          open={confirming}
          onClose={() => (deleting ? null : setConfirming(false))}
          title={confirmTitle}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
                Hủy
              </Button>
              <Button variant="danger" onClick={handleConfirm} disabled={deleting}>
                {deleting ? 'Đang xoá…' : `${bulkDeleteLabel} ${selected.size}`}
              </Button>
            </>
          }
        >
          {confirmMessage
            ? confirmMessage(selected.size)
            : <p style={{ margin: 0 }}>Mục đã chọn sẽ bị xoá. Thao tác này không thể hoàn tác.</p>}
        </Modal>
      )}
    </div>
  );
}

export default DataTable;
