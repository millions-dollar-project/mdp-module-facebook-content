/**
 * Types for the Brain feed pipeline.
 *
 * Mirrors the Go backend shapes from `backend/internal/models/brain*.go`
 * and the JSON envelope returned by the `/api/v1/facebook/brain/*` endpoints.
 */

export type BrainFeedStatus =
  | 'ingested'
  | 'ingested_no_brain_id'
  | 'generated'
  | 'pushed'
  | 'failed';

export interface BrainFeedItem {
  id: string;
  crawledPostId: string;
  pageId: string;
  pageName?: string;
  content: string;
  mediaUrls: string[];
  videoUrls: string[];
  thumbnailUrls?: string[];
  fullPicture?: string;
  mediaType: string;
  likes: number;
  comments: number;
  shares: number;
  postedAt: string; // ISO 8601
  sourceUrl: string;
  permalink: string;
  brainContentId?: string;
  ingestedAt: string; // ISO 8601
  status: BrainFeedStatus;
  errorMessage?: string;
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