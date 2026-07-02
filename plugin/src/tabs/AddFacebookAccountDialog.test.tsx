/**
 * AddFacebookAccountDialog — tests.
 *
 * Mirrors the 9 cases from the spec's §Testing section. The component is
 * controlled; tests render once with `open=true` and drive it through
 * `onConfirm` / `onClose` callbacks.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AddFacebookAccountDialog } from './AddFacebookAccountDialog';

beforeEach(() => {
  (window as unknown as { mdp?: unknown }).mdp = {
    ipc: { invoke: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
  };
});

it('auto-suggests acc-001 when no existing accounts', () => {
  render(
    <AddFacebookAccountDialog
      open
      existingNames={[]}
      onClose={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(screen.getByTestId('add-account-name')).toHaveValue('acc-001');
});

it('auto-suggests acc-003 with two existing', () => {
  render(
    <AddFacebookAccountDialog
      open
      existingNames={['acc-001', 'acc-002']}
      onClose={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(screen.getByTestId('add-account-name')).toHaveValue('acc-003');
});

it('skips non-acc-NNN names', () => {
  render(
    <AddFacebookAccountDialog
      open
      existingNames={['my-page', 'acc-001']}
      onClose={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(screen.getByTestId('add-account-name')).toHaveValue('acc-002');
});

it('rejects blank name', () => {
  const onConfirm = vi.fn();
  render(
    <AddFacebookAccountDialog
      open
      existingNames={['acc-001']}
      onClose={() => {}}
      onConfirm={onConfirm}
    />,
  );
  fireEvent.change(screen.getByTestId('add-account-name'), { target: { value: '' } });
  fireEvent.click(screen.getByTestId('add-account-submit'));
  expect(screen.getByText(/không được để trống/i)).toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
});

it('rejects duplicate name', () => {
  const onConfirm = vi.fn();
  render(
    <AddFacebookAccountDialog
      open
      existingNames={['acc-001']}
      onClose={() => {}}
      onConfirm={onConfirm}
    />,
  );
  // input is pre-filled with acc-002 — change it to acc-001 (existing)
  fireEvent.change(screen.getByTestId('add-account-name'), { target: { value: 'acc-001' } });
  fireEvent.click(screen.getByTestId('add-account-submit'));
  expect(screen.getByText(/đã tồn tại/i)).toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
});

it('submits trimmed name on button click', () => {
  const onConfirm = vi.fn();
  render(
    <AddFacebookAccountDialog
      open
      existingNames={['acc-001']}
      onClose={() => {}}
      onConfirm={onConfirm}
    />,
  );
  fireEvent.change(screen.getByTestId('add-account-name'), { target: { value: '  acc-005  ' } });
  fireEvent.click(screen.getByTestId('add-account-submit'));
  expect(onConfirm).toHaveBeenCalledWith('acc-005');
});

it('submits on Enter key', () => {
  const onConfirm = vi.fn();
  render(
    <AddFacebookAccountDialog
      open
      existingNames={['acc-001']}
      onClose={() => {}}
      onConfirm={onConfirm}
    />,
  );
  const input = screen.getByTestId('add-account-name');
  fireEvent.change(input, { target: { value: 'acc-005' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onConfirm).toHaveBeenCalledWith('acc-005');
});

it('fires onClose from Huỷ button', () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  render(
    <AddFacebookAccountDialog
      open
      existingNames={['acc-001']}
      onClose={onClose}
      onConfirm={onConfirm}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Hủy/i }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();
});

it('re-seeds default when existingNames changes between opens', () => {
  const { rerender } = render(
    <AddFacebookAccountDialog
      open
      existingNames={[]}
      onClose={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(screen.getByTestId('add-account-name')).toHaveValue('acc-001');

  // Close, change names, reopen.
  rerender(
    <AddFacebookAccountDialog
      open={false}
      existingNames={[]}
      onClose={() => {}}
      onConfirm={() => {}}
    />,
  );
  rerender(
    <AddFacebookAccountDialog
      open
      existingNames={['acc-001']}
      onClose={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(screen.getByTestId('add-account-name')).toHaveValue('acc-002');
});
