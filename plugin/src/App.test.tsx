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
  })

  it('renders the account picker as the first-touch screen when empty', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('add-account-card')).toBeInTheDocument()
    })
    // No studio tabs yet — picker is the gate.
    expect(screen.queryByRole('tab', { name: 'Composer' })).not.toBeInTheDocument()
  })

  it('picking an account reveals the studio tabs and lands on Composer', async () => {
    mockState.accounts = [
      { id: 'alice', name: 'alice', status: 'active' },
    ]
    render(<App />)
    // Wait for the picker to render the card.
    const card = await screen.findByTestId('account-card-alice')
    fireEvent.click(card)
    // Studio mounts; Composer is the default active tab.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Composer' })).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Composer' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: /Compose Studio/i })).toBeInTheDocument()
  })

  it('switches to Kanban tab on click and shows the kanban pane', async () => {
    mockState.accounts = [{ id: 'alice', name: 'alice', status: 'active' }]
    render(<App />)
    fireEvent.click(await screen.findByTestId('account-card-alice'))
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Kanban' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Kanban' }))
    expect(screen.getByTestId('kanban-pane')).toBeInTheDocument()
  })

  it('switches to Crawl tab on click and shows the crawl pane', async () => {
    mockState.accounts = [{ id: 'alice', name: 'alice', status: 'active' }]
    render(<App />)
    fireEvent.click(await screen.findByTestId('account-card-alice'))
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Crawl' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Crawl' }))
    expect(screen.getByTestId('crawl-pane')).toBeInTheDocument()
  })
})
