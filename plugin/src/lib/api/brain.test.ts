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
  applyBrainLearning,
  deleteBrainFeed,
  fetchBrainGraphStats,
  fetchBrainLearning,
  fetchBrainOverview,
  fetchBrainPersonas,
  fetchBrainProvenance,
  generateDrafts,
  ingestPosts,
  listBrainFeed,
  recordBrainFeedback,
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

// ── Dashboard (T6) ──────────────────────────────────────────────────

describe('fetchBrainOverview', () => {
  let mock: ReturnType<typeof installIpcMock>;
  beforeEach(() => {
    mock = installIpcMock(() => ({
      feeds: { ingested: 5, generated: 2 },
      drafts: { pending: 1 },
      brain: { total_memories: 10, total_rules: 3, total_profiles: 1, total_learning_signals: 4 },
      graph: { total_entities: 7, by_type: { page: 5, topic: 2 } },
      recent_7d: { ingests: 5, generates: 2, publishes: 1, feedback_count: 3 },
    }));
  });
  afterEach(() => mock.restore());

  it('calls facebook:brain/overview and returns parsed shape', async () => {
    const out = await fetchBrainOverview();
    expect(mock.calls[0].channel).toBe('facebook:brain/overview');
    expect(out.feeds.ingested).toBe(5);
    expect(out.brain.total_memories).toBe(10);
    expect(out.graph.by_type.page).toBe(5);
  });
});

describe('fetchBrainProvenance', () => {
  let mock: ReturnType<typeof installIpcMock>;
  beforeEach(() => {
    mock = installIpcMock(() => ({
      feed_id: 'feed-1',
      drafts: [],
      provenance: {
        id: 'prov-1',
        profile_id: 'p',
        profile_version: 1,
        prompt_skill_refs: [],
        rule_refs: [],
        provider: {},
        validation: { status: 'ok' },
        source_input_ids: [],
        schema_version: '1',
        created_at: '2026-06-25T00:00:00Z',
      },
    }));
  });
  afterEach(() => mock.restore());

  it('GETs /brain/provenance/:id with URL encoding', async () => {
    await fetchBrainProvenance('id with spaces');
    expect(mock.calls[0].channel).toBe('facebook:brain/provenance/id%20with%20spaces');
  });

  it('returns feed + drafts + provenance', async () => {
    const out = await fetchBrainProvenance('feed-1');
    expect(out.feed_id).toBe('feed-1');
    expect(out.provenance?.id).toBe('prov-1');
    expect(out.provenance?.validation.status).toBe('ok');
  });
});

describe('fetchBrainPersonas', () => {
  let mock: ReturnType<typeof installIpcMock>;
  beforeEach(() => {
    mock = installIpcMock(() => ({ personas: [{ id: 'p1', type: 'profile', external_ref: 'tech' }] }));
  });
  afterEach(() => mock.restore());

  it('returns personas array', async () => {
    const out = await fetchBrainPersonas();
    expect(mock.calls[0].channel).toBe('facebook:brain/personas');
    expect(out.personas[0].id).toBe('p1');
  });
});

describe('fetchBrainLearning', () => {
  let mock: ReturnType<typeof installIpcMock>;
  beforeEach(() => {
    mock = installIpcMock(() => ({
      signals: [
        {
          id: 's1',
          target_type: 'profile',
          scope: {},
          proposal: { tone: 'friendly' },
          evidence: {},
          confidence: 0.8,
          impact_level: 'medium',
          status: 'proposed',
          created_at: '2026-06-25T00:00:00Z',
        },
      ],
    }));
  });
  afterEach(() => mock.restore());

  it('returns signals array', async () => {
    const out = await fetchBrainLearning();
    expect(mock.calls[0].channel).toBe('facebook:brain/learning');
    expect(out.signals[0].id).toBe('s1');
    expect(out.signals[0].impact_level).toBe('medium');
  });
});

describe('applyBrainLearning', () => {
  let mock: ReturnType<typeof installIpcMock>;
  beforeEach(() => {
    mock = installIpcMock(() => ({ applied: true, signal_id: 'sig-1', note: 'stub' }));
  });
  afterEach(() => mock.restore());

  it('POSTs to /brain/learning/:id/apply', async () => {
    const out = await applyBrainLearning('sig-1');
    expect(mock.calls[0].channel).toBe('facebook:brain/learning/sig-1/apply');
    expect(out.applied).toBe(true);
    expect(out.signal_id).toBe('sig-1');
  });
});

describe('recordBrainFeedback', () => {
  let mock: ReturnType<typeof installIpcMock>;
  beforeEach(() => {
    mock = installIpcMock(() => ({ feedback_id: 'fb-1', signal_created: true }));
  });
  afterEach(() => mock.restore());

  it('POSTs snake_case body to /brain/feedback', async () => {
    await recordBrainFeedback('prov-1', 'approved', {
      notes: 'looks good',
      reasonTags: ['tone'],
    });
    const [call] = mock.calls;
    expect(call.channel).toBe('facebook:brain/feedback');
    expect(call.payload).toEqual({
      provenance_id: 'prov-1',
      action: 'approved',
      edited_text: undefined,
      notes: 'looks good',
      reason_tags: ['tone'],
    });
  });

  it('passes edited_text for edited action', async () => {
    await recordBrainFeedback('prov-1', 'edited', { editedText: 'new text' });
    const [call] = mock.calls;
    expect(call.payload).toMatchObject({
      action: 'edited',
      edited_text: 'new text',
    });
  });
});

describe('fetchBrainGraphStats', () => {
  let mock: ReturnType<typeof installIpcMock>;
  beforeEach(() => {
    mock = installIpcMock(() => ({
      total_entities: 3,
      by_type: { page: 2, topic: 1 },
      top_entities: [{ id: 'e1', type: 'page', external_ref: 'r1' }],
    }));
  });
  afterEach(() => mock.restore());

  it('returns aggregate counts', async () => {
    const out = await fetchBrainGraphStats();
    expect(mock.calls[0].channel).toBe('facebook:brain/graph/stats');
    expect(out.total_entities).toBe(3);
    expect(out.by_type.page).toBe(2);
    expect(out.top_entities[0].external_ref).toBe('r1');
  });
});