const { isVideoUrl } = require("./video-extractor");

function parseGraphqlBody(body, pageInfo = {}) {
  if (typeof body !== "string" || body.length === 0) return [];
  const documents = [];
  for (const line of body.split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    try {
      documents.push(JSON.parse(text));
    } catch {}
  }

  const edges = [];
  for (const document of documents) collectStoryEdges(document, edges);

  const posts = [];
  const seen = new Set();
  for (const edge of edges) {
    const story = edge && edge.node;
    const post = parseStory(story, pageInfo);
    if (!post || seen.has(post.permalink)) continue;
    seen.add(post.permalink);
    posts.push(post);
  }
  return posts;
}

function collectStoryEdges(node, out, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const value of node) collectStoryEdges(value, out, seen);
    return;
  }
  if (node.timeline_list_feed_units && Array.isArray(node.timeline_list_feed_units.edges)) {
    out.push(...node.timeline_list_feed_units.edges);
  }
  if (node.__typename === "Story" && node.post_id) {
    out.push({ node });
  }
  for (const value of Object.values(node)) collectStoryEdges(value, out, seen);
}

function parseStory(story, pageInfo) {
  if (!story || story.__typename !== "Story") return null;
  const permalink = findPermalink(story);
  if (!permalink) return null;

  const content = findMessage(story);
  const creationTime = findFirstNumber(story, "creation_time");
  const media = collectMedia(story);
  const videoUrls = media.videoUrls.length > 0
    ? media.videoUrls
    : isVideoPermalink(permalink) ? [permalink] : [];
  const mediaType = videoUrls.length > 0
    ? "video"
    : media.imageUrls.length > 1 ? "carousel"
    : media.imageUrls.length === 1 ? "photo"
    : "text";
  const postId = String(story.post_id || media.mediaId || extractPostId(permalink) || story.id || "");
  const engagement = extractEngagement(story);

  return {
    id: postId,
    pageId: String(pageInfo.id || findOwnerId(story) || ""),
    pageName: pageInfo.name || findOwnerName(story) || "",
    content: content.slice(0, 280),
    fullContent: content,
    mediaUrls: media.imageUrls,
    videoUrls,
    thumbnailUrls: media.thumbnailUrls.slice(0, 4),
    fullPicture: media.thumbnailUrls[0] || media.imageUrls[0] || "",
    mediaType,
    likes: engagement.likes,
    comments: engagement.comments,
    shares: engagement.shares,
    reactionIcons: [],
    postedAt: creationTime ? new Date(creationTime * 1000) : new Date(0),
    permalink,
    rawData: { source: "graphql" },
  };
}

function findPermalink(story) {
  const candidates = [];
  walk(story, (key, value) => {
    if (typeof value !== "string") return;
    if (["url", "permalink_url", "video_override_url", "override_url"].includes(key)) {
      const normalized = normalizePermalink(value);
      if (normalized) candidates.push(normalized);
    }
  });
  candidates.sort((a, b) => permalinkScore(b) - permalinkScore(a));
  return candidates[0] || "";
}

function normalizePermalink(value) {
  try {
    const url = new URL(value);
    if (!url.hostname.includes("facebook.com")) return "";
    if (/\/reel\/\d+/i.test(url.pathname) || /\/videos?\/\d+/i.test(url.pathname) || /\/posts\/[^/]+/i.test(url.pathname)) {
      return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
    }
    if (url.searchParams.has("story_fbid")) {
      return `${url.origin}${url.pathname}?story_fbid=${url.searchParams.get("story_fbid")}`;
    }
  } catch {}
  return "";
}

function permalinkScore(value) {
  if (/\/posts\//i.test(value)) return 3;
  if (/\/reel\//i.test(value)) return 2;
  if (/\/videos?\//i.test(value)) return 1;
  return 0;
}

function findMessage(story) {
  const messages = [];
  walk(story, (_key, value) => {
    if (!value || typeof value !== "object") return;
    if (value.message && typeof value.message.text === "string") {
      const text = value.message.text.trim();
      if (text) messages.push(text);
    }
  });
  messages.sort((a, b) => b.length - a.length);
  return messages[0] || "";
}

function collectMedia(story) {
  const imageUrls = [];
  const thumbnailUrls = [];
  const progressiveVideos = [];
  const fallbackVideos = [];
  let mediaId = "";

  walk(story.attachments || story, (key, value, parent) => {
    if (key === "id" && !mediaId && parent && /^(Photo|Video)$/i.test(parent.__typename || "")) {
      mediaId = String(value);
    }
    if (typeof value !== "string") return;
    if (/progressive_url/i.test(key) && isVideoUrl(value)) {
      progressiveVideos.push({
        url: value,
        score: /hd/i.test(parent?.metadata?.quality || "") ? 2 : 1,
      });
      return;
    }
    if (/(?:playable|browser_native|video)_.*url|(?:sd|hd)_url/i.test(key) && isVideoUrl(value)) {
      pushUnique(fallbackVideos, value);
      return;
    }
    if (!/^https?:/i.test(value) || !/scontent|fbcdn/i.test(value)) return;
    if (!/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(value)) return;
    if (/thumbnail|first_frame|preferred_thumbnail/i.test(key)) {
      pushUnique(thumbnailUrls, value);
    } else if (/uri|image|url/i.test(key)) {
      pushUnique(imageUrls, value);
    }
  });

  for (const url of imageUrls) pushUnique(thumbnailUrls, url);
  progressiveVideos.sort((a, b) => b.score - a.score);
  const videoUrls = progressiveVideos.length > 0
    ? [progressiveVideos[0].url]
    : fallbackVideos.slice(0, 1);
  return { imageUrls, thumbnailUrls, videoUrls, mediaId };
}

function findFirstNumber(root, wantedKey) {
  let found = 0;
  walk(root, (key, value) => {
    if (!found && key === wantedKey && Number.isFinite(Number(value))) found = Number(value);
  });
  return found;
}

function findOwnerId(story) {
  return story.feedback?.owning_profile?.id || story.actors?.[0]?.id || "";
}

function findOwnerName(story) {
  return story.feedback?.owning_profile?.name || story.actors?.[0]?.name || "";
}

function extractEngagement(story) {
  const result = { likes: 0, comments: 0, shares: 0 };
  visitObjects(story.comet_sections || story.feedback || {}, (value) => {
    const type = String(value.__typename || "");
    const feedback = value.feedback;
    if (!feedback || typeof feedback !== "object") return;

    if (numericCount(feedback.reaction_count) !== null) {
      result.likes = numericCount(feedback.reaction_count) ?? result.likes;
    }
    if (/CommentActionRenderer/i.test(type)) {
      result.comments =
        numericCount(feedback.comment_rendering_instance?.comments) ??
        numericCount(feedback.comment_count) ??
        result.comments;
    }
    if (/ShareActionRenderer/i.test(type)) {
      result.shares = numericCount(feedback.share_count) ?? result.shares;
    }
  });
  return result;
}

function visitObjects(root, visit, seen = new Set()) {
  if (!root || typeof root !== "object" || seen.has(root)) return;
  seen.add(root);
  visit(root);
  for (const value of Array.isArray(root) ? root : Object.values(root)) {
    visitObjects(value, visit, seen);
  }
}

function numericCount(value) {
  const count = typeof value === "number"
    ? value
    : Number(value?.count ?? value?.total_count);
  return Number.isFinite(count) ? count : null;
}

function extractPostId(permalink) {
  return permalink.match(/\/(?:posts|reel|videos?)\/([^/?#]+)/i)?.[1] || "";
}

function isVideoPermalink(permalink) {
  return /\/reel\/|\/videos?\//i.test(permalink);
}

function pushUnique(array, value) {
  if (value && !array.includes(value)) array.push(value);
}

function walk(root, visit, seen = new Set()) {
  if (!root || typeof root !== "object" || seen.has(root)) return;
  seen.add(root);
  if (Array.isArray(root)) {
    for (const value of root) walk(value, visit, seen);
    return;
  }
  for (const [key, value] of Object.entries(root)) {
    visit(key, value, root);
    if (value && typeof value === "object") walk(value, visit, seen);
  }
}

module.exports = { parseGraphqlBody, parseStory };
