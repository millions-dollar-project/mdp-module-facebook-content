/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App } from './App'

// We expose a mutable mock so individual tests can flip `accounts` to
// simulate the post-pick state. The picker test renders with an
// empty list (the first-touch screen); the studio test renders with
// a single account and clicks it to enter the studio.
const mockState = {
  accounts: [] as Array<{ id: string; name: string; status: string }>,
}

vi.mock('./hooks/useRepost', async () => {
  const actual = await vi.importActual<typeof import('./hooks/useRepost')>('./hooks/useRepost')
  return {
    ...actual,
    useFBAccounts: () => ({
      data: mockState.accounts,
      loading: false,
      error: null,
      reload: () => undefined,
    }),
  }
})

describe('App shell', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { mdp?: unknown }).mdp
    mockState.accounts = []
    // SelectedAccountContext persists the picked account name to
    // localStorage; clear it between tests so each render starts from
    // an empty selection (matches a fresh page load).
    window.localStorage.removeItem('mdp.fb-content.selectedAccountName')
    // sessionStorage is used to mark a "fresh tab session" so the
    // picker-first mount effect only clears the stored pick once per
    // session (and not on every HMR save during dev). Clear it so each
    // test gets a deterministic fresh-session behaviour.
    window.sessionStorage.removeItem('mdp.fb-content.sessionStarted')
  })

  it('renders the account picker as the first-touch screen when empty', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('add-account-card')).toBeInTheDocument()
    })
    // No studio tabs yet — picker is the gate.
    expect(screen.queryByRole('tab', { name: 'Composer' })).not.toBeInTheDocument()
  })

  it('picker-first entry: shows picker even when a pick is stored', async () => {
    // Seed localStorage as if a previous session left a pick behind —
    // the picker-first entry flow must ignore it and surface the picker.
    window.localStorage.setItem('mdp.fb-content.selectedAccountName', 'alice')
    mockState.accounts = [{ id: 'alice', name: 'alice', status: 'active' }]
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('account-card-alice')).toBeInTheDocument()
    })
    // No studio tabs while picker is visible.
    expect(screen.queryByRole('tab', { name: 'Composer' })).not.toBeInTheDocument()
    // The previously stored name was cleared by the fresh-session effect.
    expect(window.localStorage.getItem('mdp.fb-content.selectedAccountName')).toBeNull()
  })

  it('picking an account reveals the studio tabs and lands on Composer', async () => {
    mockState.accounts = [
      { id: 'alice', name: 'alice', status: 'active' },
    ]
    render(<App />)
    // Wait for the picker to render the card. Once it's clickable we
    // immediately fire the click; after refactor the picker unmounts
    // on the same tick so we don't search for it again afterwards.
    const card = await screen.findByTestId('account-card-alice', {}, { timeout: 2000 })
    fireEvent.click(card)
    // Studio mounts; Composer is the default active tab.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Composer' })).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Composer' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: /Compose Studio/i })).toBeInTheDocument()
  })

  it('"Đổi tài khoản" header button returns to the picker', async () => {
    mockState.accounts = [{ id: 'alice', name: 'alice', status: 'active' }]
    render(<App />)
    fireEvent.click(await screen.findByTestId('account-card-alice', {}, { timeout: 2000 }))
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Composer' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('switch-account-button'))
    await waitFor(() => {
      expect(screen.getByTestId('account-card-alice')).toBeInTheDocument()
    })
    // Studio unmounted; picker is back.
    expect(screen.queryByRole('tab', { name: 'Composer' })).not.toBeInTheDocument()
  })

  it('switches to Kanban tab on click and shows the kanban pane', async () => {
    mockState.accounts = [{ id: 'alice', name: 'alice', status: 'active' }]
    render(<App />)
    fireEvent.click(await screen.findByTestId('account-card-alice', {}, { timeout: 2000 }))
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Kanban' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Kanban' }))
    expect(screen.getByTestId('kanban-pane')).toBeInTheDocument()
  })

  it('switches to Crawl tab on click and shows the crawl pane', async () => {
    mockState.accounts = [{ id: 'alice', name: 'alice', status: 'active' }]
    render(<App />)
    fireEvent.click(await screen.findByTestId('account-card-alice', {}, { timeout: 2000 }))
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Crawl' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Crawl' }))
    expect(screen.getByTestId('crawl-pane')).toBeInTheDocument()
  })
})
