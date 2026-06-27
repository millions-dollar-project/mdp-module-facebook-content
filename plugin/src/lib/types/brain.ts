/**
 * Types for the Brain feed pipeline.
 *
 * Mirrors the Go backend shapes from `backend/internal/models/brain*.go`
 * and the JSON envelope returned by the `/api/v1/facebook/brain/*` endpoints.
 *
 * IMPORTANT: Go's `encoding/json` marshals struct fields verbatim, so all
 * keys arrive at the frontend with the original Go field-name casing
 * (PascalCase: `Content`, `MediaURLs`, `CrawledPostID`). These TS interfaces
 * intentionally mirror that casing so the data shape matches the wire format
 * 1:1. Earlier revisions of this file used camelCase fields and required a
 * runtime `camelCaseKeys` normalizer; that approach was abandoned because
 * the conventions for acronym lowercasing (e.g. `crawledPostId` vs
 * `crawledPostID`) are inconsistent across this codebase. Aligning TS
 * directly with the wire format keeps both sides in sync and removes the
 * need for runtime key rewriting.
 */

export type BrainFeedStatus =
  | 'ingested'
  | 'ingested_no_brain_id'
  | 'generated'
  | 'pushed'
  | 'failed';

export interface BrainFeedItem {
  ID: string;
  CrawledPostID: string;
  PageID: string;
  PageName?: string;
  Content: string;
  MediaURLs: string[];
  VideoURLs: string[];
  ThumbnailURLs?: string[];
  FullPicture?: string;
  MediaType: string;
  Likes: number;
  Comments: number;
  Shares: number;
  PostedAt: string; // ISO 8601
  SourceURL: string;
  Permalink: string;
  BrainContentID?: string;
  IngestedAt: string; // ISO 8601
  Status: BrainFeedStatus;
  ErrorMessage?: string;
}

export interface BrainFeedListResponse {
  items: BrainFeedItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type BrainDraftValidation = 'ok' | 'warning' | 'blocked';

export interface BrainDraft {
  id: string;
  feedId: string;
  content: string;
  provenanceId: string;
  validationStatus: BrainDraftValidation;
  warnings: string[];
  kanbanJobId?: string;
}

export interface IngestPostsRequest {
  posts: Array<{
    sourceURL: string;
    pageID?: string;
    pageName?: string;
    content: string;
    mediaURLs: string[];
    videoURLs: string[];
    thumbnailURLs?: string[];
    fullPicture?: string;
    mediaType: string;
    likes: number;
    comments: number;
    shares: number;
    postedAt: string;
    permalink: string;
  }>;
}

export interface IngestResponse {
  ingested: number;
  skipped: number;
  failed: number;
}

export interface GenerateRequest {
  feedIds: string[];
  personaId?: string;
}

export interface GenerateResponse {
  drafts: BrainDraft[];
  failures: Array<{ feedId: string; err: string }>;
}

// ── Dashboard types (T6) ─────────────────────────────────────────────

/** Aggregated dashboard view assembled by BrainStatsService. */
export interface BrainOverview {
  feeds: Record<string, number>;
  drafts: Record<string, number>;
  brain: {
    total_memories: number;
    total_rules: number;
    total_profiles: number;
    total_learning_signals: number;
  };
  graph: {
    total_entities: number;
    by_type: Record<string, number>;
  };
  recent_7d: {
    ingests: number;
    generates: number;
    publishes: number;
    feedback_count: number;
  };
  warnings?: string[];
}

/** Single provenance record returned by brain_get_provenance. */
export interface BrainProvenance {
  id: string;
  context_package_id?: string;
  profile_id?: string;
  profile_version?: number;
  account_id?: string;
  prompt_skill_refs: unknown[];
  rule_refs: unknown[];
  provider: Record<string, unknown>;
  validation: { status: 'ok' | 'warning' | 'blocked'; details?: string[] };
  source_input_ids: string[];
  schema_version: string;
  created_at: string;
}

/** Response from /brain/provenance/:id — feed + drafts + provenance. */
export interface BrainProvenanceDetail {
  feed_id: string;
  feed?: BrainFeedItem;
  drafts: BrainDraft[];
  provenance?: BrainProvenance;
  warnings?: string[];
}

/** Persona entity known to the Brain MCP (graph type=profile). */
export interface BrainPersona {
  id: string;
  type: string;
  external_ref?: string;
}

/** Proposed learning signal returned by brain_get_learning_state. */
export interface BrainLearningSignal {
  id: string;
  target_type: string;
  target_id?: string;
  scope: unknown;
  proposal: Record<string, unknown>;
  evidence: Record<string, unknown>;
  confidence: number;
  impact_level: 'low' | 'medium' | 'high';
  status: 'proposed' | 'active' | 'rejected' | 'deprecated';
  created_at: string;
}

/** Aggregate counts over the Brain entity graph. */
export interface BrainGraphStats {
  total_entities: number;
  by_type: Record<string, number>;
  top_entities: Array<{ id: string; type: string; external_ref: string }>;
}