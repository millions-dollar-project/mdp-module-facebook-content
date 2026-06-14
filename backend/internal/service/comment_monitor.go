package service

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/fb"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// CommentMonitor watches post comments, classifies them, and performs
// auto-like / auto-reply / private-message actions.
type CommentMonitor struct {
	commentsRepo repo.CommentsRepo
	pagesRepo    repo.PagesRepo
	graph        *fb.Client
	ai           *AIResponder
	log          *slog.Logger
}

// NewCommentMonitor builds the monitor.
func NewCommentMonitor(cr repo.CommentsRepo, pr repo.PagesRepo, graph *fb.Client, ai *AIResponder, log *slog.Logger) *CommentMonitor {
	return &CommentMonitor{commentsRepo: cr, pagesRepo: pr, graph: graph, ai: ai, log: log}
}

// ProcessPageComments fetches recent posts, their comments, analyses
// unprocessed comments and acts on them.
func (s *CommentMonitor) ProcessPageComments(ctx context.Context, pageID string) error {
	page, err := s.pagesRepo.GetByFBID(ctx, pageID)
	if err != nil {
		return err
	}
	posts, err := s.graph.GetPosts(ctx, page.PageID, page.PageAccessToken, 10)
	if err != nil {
		return fmt.Errorf("get posts: %w", err)
	}
	for _, p := range posts {
		comments, err := s.graph.GetComments(ctx, p.ID, page.PageAccessToken, 50)
		if err != nil {
			s.log.Warn("get comments failed", "postID", p.ID, "err", err)
			continue
		}
		for _, c := range comments {
			// Upsert comment into DB.
			commentModel := models.Comment{
				ID:          c.ID,
				PostID:      p.ID,
				PageID:      page.ID,
				FromID:      &c.From.ID,
				FromName:    c.From.Name,
				Message:     c.Message,
				CreatedTime: &c.CreatedTime,
				LikeCount:   c.LikeCount,
				ReplyCount:  c.CommentCount,
				Sentiment:   "neutral",
				Intent:      "other",
				Priority:    50,
				IsHidden:    c.IsHidden,
				IsLiked:     false,
				ReceivedAt:  time.Now(),
				Processed:   false,
			}
			if err := s.commentsRepo.Upsert(ctx, commentModel); err != nil {
				s.log.Warn("upsert comment failed", "commentID", c.ID, "err", err)
				continue
			}
			// Re-fetch DB state so we don't overwrite is_liked / is_private_reply_sent.
			dbComment, err := s.commentsRepo.Get(ctx, c.ID)
			if err != nil {
				dbComment = commentModel
			}
			// Skip if already processed.
			if dbComment.Processed {
				continue
			}
			// Atomic claim.
			claimed, err := s.commentsRepo.Claim(ctx, c.ID, "monitor-"+pageID)
			if err != nil || !claimed {
				continue
			}
			// Classify.
			intent := s.ai.ClassifyIntent(c.Message)
			sentiment := classifySentiment(c.Message)
			analysis := models.CommentAnalysis{
				Sentiment:                sentiment,
				Intent:                   intent,
				Priority:                 priorityFromIntent(intent, sentiment),
				ShouldLike:               shouldLike(intent, sentiment),
				ShouldReplyPublic:        shouldReplyPublic(intent),
				ShouldSendPrivateMessage: shouldPM(intent, sentiment, commentModel.IsPrivateReplySent),
				CollectedInfo:            s.ai.ExtractSlots(c.Message),
			}
			// Update DB with analysis.
			_ = s.commentsRepo.Upsert(ctx, models.Comment{
				ID:                 c.ID,
				PostID:             p.ID,
				PageID:             page.ID,
				FromID:             &c.From.ID,
				FromName:           c.From.Name,
				Message:            c.Message,
				CreatedTime:        &c.CreatedTime,
				LikeCount:          c.LikeCount,
				ReplyCount:         c.CommentCount,
				Sentiment:          analysis.Sentiment,
				Intent:             analysis.Intent,
				Priority:           analysis.Priority,
				IsHidden:           c.IsHidden,
				IsLiked:            dbComment.IsLiked,
				IsPrivateReplySent: dbComment.IsPrivateReplySent,
				CollectedInfo:      analysis.CollectedInfo,
				ReceivedAt:         time.Now(),
				Processed:          false,
			})

			// Execute actions.
			if analysis.ShouldLike && !dbComment.IsLiked {
				if err := s.graph.LikeComment(ctx, c.ID, page.PageAccessToken); err != nil {
					s.log.Warn("like comment failed", "commentID", c.ID, "err", err)
				} else {
					_ = s.commentsRepo.UpdateLiked(ctx, c.ID, true)
				}
			}
			if analysis.ShouldReplyPublic {
				replyText := publicReplyForIntent(intent)
				fbReplyID, err := s.graph.ReplyToComment(ctx, c.ID, replyText, page.PageAccessToken)
				if err != nil {
					s.log.Warn("public reply failed", "commentID", c.ID, "err", err)
				} else {
					_ = s.commentsRepo.InsertReply(ctx, models.CommentReply{
						CommentID:       c.ID,
						ReplyType:       "public",
						Content:         replyText,
						SentBy:          "AI",
						Status:          "sent",
						FacebookReplyID: &fbReplyID,
						SentAt:          time.Now(),
					})
				}
			}
			if analysis.ShouldSendPrivateMessage {
				pmText := privateMessageForIntent(intent, c.From.Name)
				pmID, err := s.graph.SendPrivateReply(ctx, c.ID, pmText, page.PageAccessToken)
				if err != nil {
					s.log.Warn("private reply failed", "commentID", c.ID, "err", err)
				} else {
					_ = s.commentsRepo.UpdatePrivateReply(ctx, c.ID, true)
					_ = s.commentsRepo.InsertReply(ctx, models.CommentReply{
						CommentID:       c.ID,
						ReplyType:       "private",
						Content:         pmText,
						SentBy:          "AI",
						Status:          "sent",
						FacebookReplyID: &pmID,
						SentAt:          time.Now(),
					})
				}
			}
			_ = s.commentsRepo.MarkProcessed(ctx, c.ID)
		}
	}
	return nil
}

func classifySentiment(text string) string {
	t := strings.ToLower(text)
	if strings.Contains(t, "tuyệt") || strings.Contains(t, "hay") || strings.Contains(t, "thích") || strings.Contains(t, "good") || strings.Contains(t, "tốt") {
		return "positive"
	}
	if strings.Contains(t, "tệ") || strings.Contains(t, "kém") || strings.Contains(t, "chán") || strings.Contains(t, "thất vọng") || strings.Contains(t, "dở") {
		return "negative"
	}
	return "neutral"
}

func priorityFromIntent(intent, sentiment string) int {
	switch intent {
	case "interested", "asking_price":
		if sentiment == "positive" {
			return 90
		}
		return 70
	case "complaint":
		return 80
	default:
		return 50
	}
}

func shouldLike(intent, sentiment string) bool {
	return sentiment == "positive" || intent == "interested"
}

func shouldReplyPublic(intent string) bool {
	return intent == "asking_price" || intent == "general"
}

func shouldPM(intent, sentiment string, alreadySent bool) bool {
	if alreadySent {
		return false
	}
	return intent == "interested" || (intent == "asking_price" && sentiment != "negative")
}

func publicReplyForIntent(intent string) string {
	switch intent {
	case "asking_price":
		return "Dạ giá chi tiết bên em đã gửi inbox cho anh/chị rồi ạ! Em cũng để lại thông tin bên dưới để anh/chị tiện tham khảo ạ 💬"
	case "general":
		return "Dạ em cảm ơn anh/chị đã quan tâm ạ! Nếu cần thêm thông tin gì, anh/chị cứ để lại bình luận hoặc nhắn riêng em nhé ạ!"
	default:
		return "Dạ em cảm ơn anh/chị ạ!"
	}
}

func privateMessageForIntent(intent string, fromName string) string {
	greeting := "Dạ em chào anh/chị"
	if fromName != "" {
		greeting = fmt.Sprintf("Dạ em chào %s", fromName)
	}
	switch intent {
	case "interested":
		return fmt.Sprintf("%s! Em là tư vấn viên bên trường. Anh/chị đang quan tâm đến chương trình học đúng không ạ? Em xin phép gửi thông tin chi tiết qua đây cho tiện ạ! 📚", greeting)
	case "asking_price":
		return fmt.Sprintf("%s! Em đã gửi bảng giá và lịch học chi tiết qua tin nhắn này rồi ạ. Anh/chị vui lòng xem qua, có gì thắc mắc cứ hỏi em nhé! 💰", greeting)
	default:
		return fmt.Sprintf("%s! Em cảm ơn anh/chị đã quan tâm ạ. Em xin phép gửi thêm thông tin qua tin nhắn này ạ! 📩", greeting)
	}
}
