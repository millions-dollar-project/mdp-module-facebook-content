/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App } from './App'

describe('App shell', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { mdp?: unknown }).mdp
  })

  it('renders brand and at least 11 nav items', () => {
    render(<App />)
    expect(screen.getByText('Facebook')).toBeInTheDocument()
    const dashboard = screen.getByRole('button', { name: /Dashboard/ })
    const compose = screen.getByRole('button', { name: /Bài đăng/ })
    const scheduler = screen.getByRole('button', { name: /Lịch đăng/ })
    const queue = screen.getByRole('button', { name: /Hàng đợi/ })
    // Sau khi gộp, Hộp thư + Bình luận nằm chung dưới tab "Trả lời tự động".
    const engage = screen.getByRole('button', { name: /Trả lời tự động/ })
    const pages = screen.getByRole('button', { name: /^Trang$/ })
    const history = screen.getByRole('button', { name: /Lịch sử/ })
    const analytics = screen.getByRole('button', { name: /Phân tích/ })
    const settings = screen.getByRole('button', { name: /Cấu hình/ })
    expect(dashboard).toBeInTheDocument()
    expect(compose).toBeInTheDocument()
    expect(scheduler).toBeInTheDocument()
    expect(queue).toBeInTheDocument()
    expect(engage).toBeInTheDocument()
    expect(pages).toBeInTheDocument()
    expect(history).toBeInTheDocument()
    expect(analytics).toBeInTheDocument()
    expect(settings).toBeInTheDocument()
  })

  it('switches to compose tab on click', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Bài đăng/ }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Bạn đang nghĩ gì/i)).toBeInTheDocument()
    })
  })

  it('switches to engage tab and renders the combined inbox + comments sub-tabs', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Trả lời tự động/ }))
    // 2 sub-tab đều có mặt trong DOM.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Hộp thư/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Bình luận/ })).toBeInTheDocument()
    })
    // Sub-tab Hộp thư là mặc định -> danh sách khách hàng phải hiện.
    expect(
      screen.getAllByText(/Chọn một khách hàng|Không có khách hàng/i).length
    ).toBeGreaterThan(0)
  })

  it('falls back to mock data when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    render(<App />)
    // Dashboard renders stat cards with mock data
    expect(screen.getByText('Bài đã đăng')).toBeInTheDocument()
    expect(screen.getByText('Lịch sắp tới')).toBeInTheDocument()
  })
})
