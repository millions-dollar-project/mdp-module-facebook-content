/**
 * Domain types for the Facebook module.
 *
 * Mirrors the schema used by `social-content-automation` so the future
 * Go backend can use the same field names and the UI does not need to
 * change once the API is wired in.
 */

export type PostStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';
export type PostType = 'text' | 'photo' | 'video' | 'link' | 'carousel' | 'reel';
export type HeatLevel = 'hot' | 'warm' | 'cold' | 'unknown';
export type ConversationStatus = 'open' | 'closed' | 'archived';
export type CommentSentiment = 'positive' | 'neutral' | 'negative';
export type CommentIntent = 'question' | 'complaint' | 'purchase' | 'feedback' | 'spam' | 'other';
export type CampaignVariant = 'ai' | 'repost';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'finished' | 'cancelled';
export type CampaignDestination = 'group' | 'page' | 'personal';

export interface FacebookPage {
  id: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  isActive: boolean;
  postingEnabled: boolean;
  aiEnabled: boolean;
  category?: string;
  followersCount?: number;
  lastActiveAt?: string;
  avatarUrl?: string;
  // AI persona per page
  aiRole?: string;
  aiIndustry?: string;
  aiTone?: string;
  aiPriceList?: string;
  aiLocationInfo?: string;
  aiContactChannel?: string;
  aiExtraRules?: string;
  aiSystemPrompt?: string;
}

export interface AIPersonaPayload {
  role?: string;
  industry?: string;
  tone?: string;
  priceList?: string;
  locationInfo?: string;
  contactChannel?: string;
  extraRules?: string;
  systemPrompt?: string;
}

export interface FacebookConfig {
  pageId: string;
  pageAccessToken: string;
  publishMode: 'auto' | 'review';
  defaultPageId?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
  // AI & scheduling
  aiModel: string;
  autoSchedulingEnabled: boolean;
  autoScheduleTimes: string;      // JSON array string
  timezone: string;
  // Content tones / hashtags
  defaultHashtags: string;         // JSON array string
  enabledContentTones: string;     // JSON array string
  customContentTones: string;      // JSON array string
  toneDescriptionOverrides: string; // JSON object string
  // Kling image
  klingEnabled: boolean;
  klingPromptTemplate?: string;
  klingResolution: string;
  klingAspectRatio: string;
  klingOutputCount: number;
  klingScheduleDays: string;       // JSON array string
  klingReferencePageUrl?: string;
  // Kling video
  klingVideoEnabled: boolean;
  klingVideoPrompts: string;      // JSON array string
  klingVideoAspectRatio: string;
  klingVideoOutputCount: number;
}

export interface ScheduledPost {
  id: string;
  content: string;
  pageId: string;
  pageName?: string;
  imageUrl?: string;
  mediaUrls?: string[];
  status: PostStatus;
  scheduledAt: string;
  postType: PostType;
  trendReference?: string;
  aiGenerated: boolean;
  engagementPrediction?: number;
  campaignId?: string;
  createdAt: string;
}

export interface QueueItem {
  id: string;
  content: string;
  pageId: string;
  pageName?: string;
  imageUrl?: string;
  mediaUrls?: string[];
  status: 'NEW' | 'DRAFTING' | 'REVIEW' | 'READY' | 'PUBLISHED' | 'REJECTED';
  source: 'manual' | 'ai' | 'repost' | 'campaign';
  hasMedia: boolean;
  createdAt: string;
  trendId?: string;
  promptTemplateId?: string;
}

export interface Conversation {
  id: string;
  pageId: string;
  customerId: string;
  customerName: string;
  customerAvatarUrl?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  heat: HeatLevel;
  aiEnabled: boolean;
  collectedInfo: CollectedInfo;
  contacted: boolean;
  priorityScore: number;
  conversationSummary?: string;
  status: ConversationStatus;
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  isAi: boolean;
  isFromPage: boolean;
  senderName?: string;
  attachments?: Array<{ type: 'image' | 'video' | 'file'; url: string }>;
  createdAt: string;
}

export interface CollectedInfo {
  name?: string;
  phone?: string;
  zalo?: string;
  email?: string;
  address?: string;
  location?: string;
  area?: string;
  schoolType?: string;
  budget?: string;
  style?: string;
  needs?: string;
}

export interface FacebookComment {
  id: string;
  postId: string;
  fromId: string;
  fromName: string;
  fromAvatarUrl?: string;
  message: string;
  createdAt: string;
  sentiment: CommentSentiment;
  intent: CommentIntent;
  priority: number;
  isHidden: boolean;
  isLiked: boolean;
  isPrivateReplySent: boolean;
  collectedInfo?: CollectedInfo;
  postPermalink?: string;
}

export interface CommentReply {
  id: string;
  commentId: string;
  content: string;
  isAi: boolean;
  isPrivate: boolean;
  createdAt: string;
}

export interface Trend {
  id: string;
  topic: string;
  category: string;
  score: number;
  viralityScore: number;
  status: 'ACTIVE' | 'EMERGING' | 'PEAK' | 'FADING';
  summary: string;
  keywords: string[];
  discoveredAt: string;
  postCount?: number;
}

export interface CrawledPost {
  id: string;
  pageId: string;
  pageName: string;
  content: string;
  imageUrl?: string;
  postUrl?: string;
  likes: number;
  comments: number;
  shares: number;
  viralityScore: number;
  trendCategory?: string;
  publishedAt: string;
  crawledAt: string;
}

export interface Competitor {
  id: string;
  pageId: string;
  pageName: string;
  pageUrl: string;
  category?: string;
  isActive: boolean;
  lastCrawledAt?: string;
  postsCount: number;
}

export interface Campaign {
  id: string;
  name: string;
  variant: CampaignVariant;
  /** Nơi bài viết sẽ được đăng: nhóm FB, page, hoặc trang cá nhân. */
  destination: CampaignDestination;
  status: CampaignStatus;
  promptTemplateId?: string;
  postsPerDay: number;
  startDate: string;
  endDate: string;
  timezone: string;
  scheduleSlots?: string[];
  hashtags?: string[];
  hashtagCount?: number;
  klingEnabled?: boolean;
  klingOutputCount?: number;
  pageId?: string;
  crossPageIds?: string[];
  autoApprove: boolean;
  progress?: { total: number; published: number; pending: number; failed: number };
  createdAt: string;
}

export interface CampaignPost {
  id: string;
  campaignId: string;
  dayIndex: number;
  slot: 'morning' | 'noon' | 'evening' | 'night';
  scheduledAt: string;
  content: string;
  imageUrl?: string;
  status: PostStatus;
  publishedAt?: string;
  errorMessage?: string;
}

export interface PostHistoryEntry {
  id: string;
  postId: string;
  pageId: string;
  pageName: string;
  content: string;
  postUrl: string;
  imageUrl?: string;
  publishedAt: string;
  likes: number;
  comments: number;
  shares: number;
  reach?: number;
  engagementRate?: number;
}

export interface DailyStats {
  date: string;
  postsPublished: number;
  postsScheduled: number;
  postsFailed: number;
  totalEngagement: number;
  totalReach: number;
  aiReplies: number;
  messagesReplied: number;
}

export interface EngagementAnalytics {
  range: '7d' | '30d' | '90d';
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalReach: number;
  totalEngagement: number;
  engagementRate: number;
  series: Array<{ date: string; likes: number; comments: number; shares: number }>;
}

export interface PromptTemplate {
  id: string;
  name: string;
  promptText: string;
  category: string;
  variablesJson: string;
  description?: string;
  isActive: boolean;
  supportedTones: string;
  createdAt: string;
  updatedAt: string;
}

export interface HashtagEntry {
  tag: string;
  category?: string;
}

export interface VideoConfig {
  watermarkType: string;
  watermarkText?: string;
  watermarkImagePath?: string;
}

export interface ContentTone {
  id: string;
  name: string;
  description: string;
  isCustom: boolean;
}

export interface PageSettings {
  pageId: string;
  pageName: string;
  aiEnabled: boolean;
  autoReplyEnabled: boolean;
  autoLikeEnabled: boolean;
  maxAiTurns: number;
  contactCollectionEnabled: boolean;
}

// ─── Repost flow (Crawl → Spin → Schedule → Group) ─────────────────

export interface FBAccount {
  id: string;
  name: string;
  /**
   * SHA-1 v5 UUID derived from `name` (mirrors
   * `service.AccountUUIDFromName` on the Go side). The Brain tab
   * dropdown forwards this UUID to dashboard endpoints via
   * `?account_id=`; consumers that don't care can safely ignore it.
   */
  uuid?: string;
  email?: string;
  /**
   * Display profile path. Server-side `kit-accounts` derives a default
   * (`~/.mdp/facebook/profiles/<name>`) when omitted, so this is
   * informational for the UI rather than a hard contract.
   */
  profilePath?: string;
  cookiesJson?: string;
  status: string;
  lastUsedAt?: string;
  createdAt?: string;
}

export interface FBGroup {
  id: string;
  groupId: string;
  name?: string;
  assignedAccountId?: string;
  status: string;
  lastPostedAt?: string;
  createdAt: string;
}

export interface RepostCampaign {
  id: string;
  name: string;
  sourcePostUrl: string;
  sourcePostText: string;
  sourcePostMediaUrls?: string[];
  captionStyle: string;
  scheduledAt: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
}

export interface RepostJob {
  id: string;
  campaignId: string;
  accountId: string;
  groupId: string;
  status: string;
  attempts: number;
  lastError?: string;
  postUrl?: string;
  scheduledAt?: string;
  anonymousPosting: boolean;
  autoEnabled: boolean;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface CrawledPostReal {
  id: string;
  pageId: string;
  sourceUrl: string;
  fbPostId?: string;
  content?: string;
  mediaUrls?: string[];
  mediaType: string;
  likes: number;
  comments: number;
  shares: number;
  postedAt?: string;
  permalink?: string;
  isSelected: boolean;
  createdAt: string;
}

// ─── Repost V2 (SCA port) ─────────────────────────────────────────────

export interface PlanItem {
  accountId: string;
  groupId: string;
  scheduledAt: string;     // ISO 8601 (RFC3339)
  anonymousPosting: boolean;
  autoEnabled: boolean;
}

export interface QueueFilter {
  status?: string;
  accountId?: string;
  groupId?: string;
  limit?: number;
}

export interface AccountLoginSession {
  sessionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'expired';
  profilePath: string;
  lastError?: string | null;
  updatedAt?: string;
}
