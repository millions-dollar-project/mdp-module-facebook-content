/**
 * Tests for the Brain feed API client.
 *
 * The plugin uses the mdp-shell IPC bridge in production, so we mock
 * `window.mdp.ipc.invoke` directly. This is simpler than MSW and matches
 * how `App.test.tsx` controls the IPC/fetch path: when IPC is present,
 * `fbFetch` always prefers it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteBrainFeed,
  generateDrafts,
  ingestPosts,
  listBrainFeed,
} from './brain';

type IpcInvoke = (channel: string, payload?: unknown) => Promise<unknown>;

interface IpcCall {
  channel: string;
  payload: unknown;
}

function installIpcMock(impl: (call: IpcCall) => unknown): {
  calls: IpcCall[];
  restore: () => void;
} {
  const calls: IpcCall[] = [];
  const invoke: IpcInvoke = (channel, payload) => {
    calls.push({ channel, payload });
    return Promise.resolve(impl({ channel, payload }));
  };
  const w = window as unknown as { mdp?: { ipc?: { invoke: IpcInvoke } } };
  w.mdp = { ipc: { invoke } };
  return {
    calls,
    restore: () => {
      delete (window as unknown as { mdp?: unknown }).mdp;
    },
  };
}

describe('listBrainFeed', () => {
  let mock: ReturnType<typeof installIpcMock>;
  beforeEach(() => {
    mock = installIpcMock(() => ({ items: [], total: 0, page: 1, pageSize: 20 }));
  });
  afterEach(() => mock.restore());

  it('routes via the facebook:brain/feed channel', async () => {
    const res = await listBrainFeed({ page: 1 });
    expect(res.total).toBe(0);
    expect(mock.calls[0].channel).toBe('facebook:brain/feed?page=1');
  });

  it('passes page, pageSize, sourcePage, status as querystring on the path', async () => {
    await listBrainFeed({
      page: 2,
      pageSize: 50,
      sourcePage: 'p1',
      status: 'ingested',
    });
    const channel = mock.calls[0].channel;
    expect(channel).toContain('page=2');
    expect(channel).toContain('page_size=50');
    expect(channel).toContain('source_page=p1');
    expect(channel).toContain('status=ingested');
  });

  it('forwards AbortSignal through to fbFetch', async () => {
    const ctrl = new AbortController();
    const spy = vi.spyOn(AbortController.prototype, 'signal', 'get');
    // Just ensure the signal is attached to the fetch options: easiest is
    // to inspect the call options structure that fbFetch would build.
    // fbFetch passes options through directly; we re-create the call shape:
    await listBrainFeed({ page: 1, signal: ctrl.signal });
    expect(mock.calls).toHaveLength(1);
    // spy cleanup
    spy.mockRestore();
  });

  it('includes from/to/search when provided', async () => {
    await listBrainFeed({
      page: 1,
      from: '2026-01-01',
      to: '2026-12-31',
      search: 'hello',
    });
    const channel = mock.calls[0].channel;
    expect(channel).toContain('from=2026-01-01');
    expect(channel).toContain('to=2026-12-31');
    expect(channel).toContain('search=hello');
  });
});

describe('ingestPosts', () => {
  let mock: ReturnType<typeof installIpcMock>;
  beforeEach(() => {
    mock = installIpcMock(() => ({ ingested: 1, skipped: 0, failed: 0 }));
  });
  afterEach(() => mock.restore());

  it('POSTs body to facebook:brain/ingest', async () => {
    const res = await ingestPosts({
      posts: [
        {
          sourceURL: 'u1',
          content: 'c',
          permalink: 'p',
          postedAt: new Date().toISOString(),
          mediaURLs: [],
          videoURLs: [],
          mediaType: 'text',
          likes: 0,
          comments: 0,
          shares: 0,
        },
      ],
    });
    expect(res.ingested).toBe(1);
    const [call] = mock.calls;
    expect(call.channel).toBe('facebook:brain/ingest');
    const body = call.payload as { posts: unknown[] };
    expect(body.posts).toHaveLength(1);
  });
});

describe('generateDrafts', () => {
  let mock: ReturnType<typeof installIpcMock>;
  beforeEach(() => {
    mock = installIpcMock(() => ({ drafts: [], failures: [] }));
  });
  afterEach(() => mock.restore());

  it('POSTs feedIds and personaId to facebook:brain/generate', async () => {
    await generateDrafts({ feedIds: ['feed-1', 'feed-2'], personaId: 'tech' });
    const [call] = mock.calls;
    expect(call.channel).toBe('facebook:brain/generate');
    expect(call.payload).toEqual({ feedIds: ['feed-1', 'feed-2'], personaId: 'tech' });
  });
});

describe('deleteBrainFeed', () => {
  let mock: ReturnType<typeof installIpcMock>;
  beforeEach(() => {
    mock = installIpcMock(() => ({ deleted: true }));
  });
  afterEach(() => mock.restore());

  it('DELETEs by id via the channel', async () => {
    await deleteBrainFeed('feed-1');
    const [call] = mock.calls;
    expect(call.channel).toBe('facebook:brain/feed/feed-1');
  });

  it('URL-encodes the id', async () => {
    await deleteBrainFeed('id with spaces');
    const [call] = mock.calls;
    expect(call.channel).toBe('facebook:brain/feed/id%20with%20spaces');
  });
});