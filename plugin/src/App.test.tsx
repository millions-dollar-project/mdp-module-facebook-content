/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'

describe('App shell', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { mdp?: unknown }).mdp
  })

  it('renders the three top-level studio tabs', () => {
    render(<App />)
    expect(screen.getByRole('tab', { name: 'Composer' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Kanban' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Crawl' })).toBeInTheDocument()
  })

  it('Composer tab is active by default and shows the brain UI', () => {
    render(<App />)
    const composerTab = screen.getByRole('tab', { name: 'Composer' })
    expect(composerTab).toHaveAttribute('aria-selected', 'true')
    // FacebookBrain renders the compose button
    expect(screen.getByRole('button', { name: /Compose Studio/i })).toBeInTheDocument()
  })

  it('switches to Kanban tab on click and shows kanban columns', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'Kanban' }))
    expect(screen.getByTestId('kanban-pane')).toBeInTheDocument()
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('switches to Crawl tab on click and shows crawl configuration', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'Crawl' }))
    expect(screen.getByTestId('crawl-pane')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Run Discovery Crawl/i })).toBeInTheDocument()
    expect(screen.getByTestId('crawl-list')).toBeInTheDocument()
  })
})
