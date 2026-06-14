package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/fb"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

// Publisher is the bridge between the service layer and the Facebook
// Graph API. It is the only place that knows how to translate an
// internal "publish this content" into a Graph call + persistence.
type Publisher struct {
	graph *fb.Client
	posts repo.PostsRepo
	pages repo.PagesRepo
	log   *slog.Logger
}

// NewPublisher builds a Publisher.
func NewPublisher(g *fb.Client, p repo.PostsRepo, pg repo.PagesRepo, log *slog.Logger) *Publisher {
	return &Publisher{graph: g, posts: p, pages: pg, log: log}
}

// PublishContent posts the message to the given page and records the
// success in post_history. Returns the FB post id on success.
func (p *Publisher) PublishContent(ctx context.Context, page models.Page, content string) (string, error) {
	if !page.IsActive || !page.PostingEnabled {
		return "", errors.New("page is inactive or posting disabled")
	}
	if page.PageAccessToken == "" {
		return "", errors.New("page has no access token")
	}
	postID, err := p.graph.PostToPageFeed(ctx, page.PageID, page.PageAccessToken, content)
	if err != nil {
		return "", fmt.Errorf("graph publish: %w", err)
	}
	now := time.Now().UTC()
	if _, err := p.posts.InsertHistory(ctx, models.PostHistoryEntry{
		PostID:      postID,
		PageID:      page.ID,
		Content:     content,
		PublishedAt: now,
	}); err != nil {
		// The post went out — log and continue. A failure here would
		// lie to the user that the publish failed when it actually
		// succeeded.
		p.log.Error("insert post_history failed (post was published)", "postID", postID, "err", err)
	}
	return postID, nil
}
