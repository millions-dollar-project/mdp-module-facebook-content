package service

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/ai"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/telemetry"
)

// AIResponder orchestrates OpenAI calls for Messenger auto-reply.
type AIResponder struct {
	openai       *ai.Client
	convRepo     repo.ConversationsRepo
	msgRepo      repo.MessagesRepo
	inbox        *Inbox
	pagesRepo    repo.PagesRepo
	personasRepo repo.AIPersonasRepo
	log          *slog.Logger
	rl           *aiRateLimiter
	cb           *circuitBreaker
}

// NewAIResponder builds the responder. A global fallback persona is
// defined inside buildSystemPrompt; per-page overrides come from the DB.
func NewAIResponder(openai *ai.Client, conv repo.ConversationsRepo, msg repo.MessagesRepo, inbox *Inbox, pages repo.PagesRepo, personas repo.AIPersonasRepo, log *slog.Logger) *AIResponder {
	return &AIResponder{
		openai:      openai,
		convRepo:    conv,
		msgRepo:     msg,
		inbox:       inbox,
		pagesRepo:   pages,
		personasRepo: personas,
		log:         log,
		rl:          newAIRateLimiter(),
		cb:          newCircuitBreaker(),
	}
}

// MaybeReply checks AI gating and, if allowed, synthesises and sends a
// reply. inboundMsgID is the Facebook message id used for idempotency.
const maxAITurns = 15

func (s *AIResponder) MaybeReply(ctx context.Context, convID, inboundMsgID string) error {
	conv, err := s.convRepo.Get(ctx, convID)
	if err != nil {
		return err
	}
	if !conv.AIEnabled {
		return nil
	}

	// Fetch page config once.
	page, _ := s.pagesRepo.GetByFBID(ctx, conv.PageID)

	// Turn limit: count AI-generated messages in this conversation.
	aiTurns, err := s.msgRepo.CountAITurns(ctx, convID)
	if err != nil {
		s.log.Warn("failed to count ai turns", "convID", convID, "err", err)
		// fail-safe: continue rather than block
	} else if aiTurns >= maxAITurns {
		s.log.Info("ai turn limit reached, disabling ai for conversation", "convID", convID, "turns", aiTurns)
		_ = s.convRepo.ToggleAI(ctx, convID, false)
		return nil
	}

	// Rate limit check
	if !s.rl.Allow(convID, page.PageID) {
		s.log.Warn("ai reply rate limited", "convID", convID, "pageID", page.PageID)
		return nil
	}

	// Circuit breaker check
	if !s.cb.Allow() {
		s.log.Warn("ai circuit breaker open", "convID", convID, "state", s.cb.State())
		return nil
	}

	// Fetch last 10 messages (DESC by sent_at).
	msgs, err := s.msgRepo.ListByConversation(ctx, convID, 10)
	if err != nil {
		return err
	}

	// Idempotency: skip if we already replied to this exact inbound id.
	if len(msgs) > 0 && msgs[0].IsAi && time.Since(msgs[0].SentAt) < 30*time.Second {
		return nil
	}

	// Build chronological history for the AI API.
	history := s.messagesToHistory(msgs)

	// The last item in history is the latest user message.
	var userText string
	if len(history) > 0 && history[len(history)-1].Role == "user" {
		userText = history[len(history)-1].Content
	}
	s.log.Debug("maybe reply", "convID", convID, "userText", scrubPII(userText))

	// Stop-auto-chat guard: phone numbers, explicit contact requests, etc.
	if stop, reason := shouldStopAutoChat(userText); stop {
		s.log.Info("auto-chat stop signal detected, disabling ai", "convID", convID, "reason", reason)
		_ = s.convRepo.ToggleAI(ctx, convID, false)
		return nil
	}

	// Determine system prompt.
	var system string
	var isEcoHome bool
	var ecoIn ecoPromptInput
	if page.AIPersonaID != nil && s.personasRepo != nil {
		persona, perr := s.personasRepo.Get(ctx, *page.AIPersonaID)
		if perr == nil {
			switch persona.PostProcessorType {
			case "ecohome":
				isEcoHome = true
				ecoIn = s.buildEcoPromptInput(conv, msgs, history, userText)
				if persona.SystemPrompt != "" {
					system = persona.SystemPrompt + "\n\n" + ecoIn.MemoryContext + "\n" + ecoIn.HistoryText + "\n" + ecoIn.EffectiveMessage
				} else {
					system = BuildEcoHomeSystemPrompt(ecoIn)
				}
				if persona.FewShotExamples != nil && *persona.FewShotExamples != "" {
					system += "\n" + *persona.FewShotExamples
				} else {
					system += "\n" + EcoHomeFewShotExamples()
				}
			default:
				if persona.SystemPrompt != "" {
					system = persona.SystemPrompt
				} else {
					system = s.buildGenericSystemPrompt(ctx, conv, page)
				}
			}
		} else {
			s.log.Warn("failed to load persona, falling back", "convID", convID, "personaID", *page.AIPersonaID, "err", perr)
		}
	}
	if system == "" {
		if page.AISystemPrompt != nil && *page.AISystemPrompt != "" {
			system = *page.AISystemPrompt
		} else if page.PageID == ecohomePageID {
			isEcoHome = true
			ecoIn = s.buildEcoPromptInput(conv, msgs, history, userText)
			system = BuildEcoHomeSystemPrompt(ecoIn) + "\n" + EcoHomeFewShotExamples()
		} else {
			system = s.buildGenericSystemPrompt(ctx, conv, page)
		}
	}

	reply, err := s.callAI(ctx, system, history, userText)
	if err != nil {
		return err
	}

	// Post-processing.
	if isEcoHome {
		recentAssistant := s.recentAssistantContents(msgs, 4)
		var lastAssistant string
		if len(recentAssistant) > 0 {
			lastAssistant = recentAssistant[0] // newest first
		}
		result := CleanOutputEcoHome(
			reply,
			ecoIn.CustomerPronoun,
			lastAssistant,
			recentAssistant,
			userText,
			isDirectQuestion(userText),
			hasStatementPattern(userText),
		)
		reply = result.Content
		if result.WantsNoReply || reply == "" {
			return nil
		}
	} else {
		reply = s.cleanOutput(reply, conv.CollectedInfo)
		if reply == "" {
			return nil
		}
	}

	// Deduplicate against the last outbound message.
	if len(msgs) > 0 && msgs[0].IsFromPage && strings.TrimSpace(msgs[0].Content) == strings.TrimSpace(reply) {
		s.log.Debug("ai reply duplicated last outbound, skipping", "convID", convID)
		return nil
	}

	_, err = s.inbox.SendMessage(ctx, convID, reply, true)
	if err == nil {
		telemetry.AIReplies.WithLabelValues(conv.PageID).Inc()
	}
	return err
}

func (s *AIResponder) messagesToHistory(msgs []models.Message) []ai.Message {
	var out []ai.Message
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		role := "user"
		if m.IsFromPage {
			role = "assistant"
		}
		out = append(out, ai.Message{Role: role, Content: m.Content})
	}
	return out
}

func (s *AIResponder) recentAssistantContents(msgs []models.Message, limit int) []string {
	var out []string
	for _, m := range msgs {
		if m.IsFromPage {
			out = append(out, m.Content)
			if len(out) >= limit {
				break
			}
		}
	}
	return out
}

func (s *AIResponder) buildEcoPromptInput(conv models.Conversation, msgs []models.Message, history []ai.Message, userText string) ecoPromptInput {
	var historyText string
	start := 0
	if len(history) > 8 {
		start = len(history) - 8
	}
	var lines []string
	for i := start; i < len(history); i++ {
		m := history[i]
		who := "Khách"
		if m.Role == "assistant" {
			who = "NV"
		}
		lines = append(lines, fmt.Sprintf("%s: %s", who, m.Content))
	}
	historyText = strings.Join(lines, "\n")
	if historyText == "" {
		historyText = "Chưa có tin nhắn trước"
	}

	// Effective message (handle like/emoji/dot)
	effective := userText
	clean := strings.ReplaceAll(userText, " ", "")
	if clean == "" {
		effective = "[khách thả like/reaction]"
	} else if matched, _ := regexp.MatchString(`^[.!?,;:❤✨⭐🀄-🏿☀-⛿]+$`, clean); matched && len([]rune(clean)) <= 3 {
		effective = fmt.Sprintf(`[khách gửi: "%s"]`, userText)
	}

	// Detect pronoun from all user messages
	allUserTexts := strings.Builder{}
	for _, m := range msgs {
		if !m.IsFromPage {
			allUserTexts.WriteString(strings.ToLower(m.Content))
			allUserTexts.WriteString(" ")
		}
	}
	ut := allUserTexts.String()
	pronoun := "a/c"
	selfAnh := regexp.MustCompile(`(?:^|[.!?]\s+|\s)(anh|a\s)[\s\w].*?(?:cần|muốn|hỏi|xin|nhờ|đang|ở|làm|của)`).MatchString(ut) || regexp.MustCompile(`\banh\b`).MatchString(ut)
	selfChi := regexp.MustCompile(`(?:^|[.!?]\s+|\s)(chị|cj|c\s)[\s\w].*?(?:cần|muốn|hỏi|xin|nhờ|đang|ở|làm|của)`).MatchString(ut) || regexp.MustCompile(`\bchị\b`).MatchString(ut)
	selfCo := regexp.MustCompile(`\bcô\b`).MatchString(ut)
	selfChu := regexp.MustCompile(`\bchú\b`).MatchString(ut)
	if selfCo && !selfAnh && !selfChi && !selfChu {
		pronoun = "cô"
	} else if selfChu && !selfAnh && !selfChi && !selfCo {
		pronoun = "chú"
	} else if selfAnh && !selfChi && !selfCo && !selfChu {
		pronoun = "anh"
	} else if !selfAnh && selfChi && !selfCo && !selfChu {
		pronoun = "chị"
	}

	// Last AI purpose
	lastAIMsg := ""
	for i := len(history) - 1; i >= 0; i-- {
		if history[i].Role == "assistant" {
			lastAIMsg = history[i].Content
			break
		}
	}
	lastAIPurpose := "bắt đầu cuộc trò chuyện"
	if lastAIMsg != "" {
		if regexp.MustCompile(`(?i)sđt|zalo|liên hệ|xin.*số`).MatchString(lastAIMsg) {
			lastAIPurpose = "vừa xin SĐT/Zalo"
		} else if regexp.MustCompile(`(?i)giá|bao nhiêu|chi phí`).MatchString(lastAIMsg) {
			lastAIPurpose = "vừa giải thích giá"
		} else if regexp.MustCompile(`(?i)khu vực|ở đâu|tỉnh|thành`).MatchString(lastAIMsg) {
			lastAIPurpose = "vừa hỏi khu vực"
		} else if regexp.MustCompile(`(?i)diện tích|m2|mét`).MatchString(lastAIMsg) {
			lastAIPurpose = "vừa hỏi diện tích"
		} else if regexp.MustCompile(`(?i)cải tạo|xây mới`).MatchString(lastAIMsg) {
			lastAIPurpose = "vừa hỏi loại hình"
		} else {
			lastAIPurpose = "vừa trả lời khách"
		}
	}

	intent := s.ClassifyIntent(userText)

	// Build known info summary for prompt injection
	var knownParts []string
	if conv.CollectedInfo.Name != nil && *conv.CollectedInfo.Name != "" {
		knownParts = append(knownParts, fmt.Sprintf("tên: %s", *conv.CollectedInfo.Name))
	}
	if conv.CollectedInfo.Phone != nil && *conv.CollectedInfo.Phone != "" {
		knownParts = append(knownParts, fmt.Sprintf("SĐT: %s", *conv.CollectedInfo.Phone))
	}
	if conv.CollectedInfo.Zalo != nil && *conv.CollectedInfo.Zalo != "" {
		knownParts = append(knownParts, fmt.Sprintf("Zalo: %s", *conv.CollectedInfo.Zalo))
	}
	if conv.CollectedInfo.Location != nil && *conv.CollectedInfo.Location != "" {
		knownParts = append(knownParts, fmt.Sprintf("khu vực: %s", *conv.CollectedInfo.Location))
	}
	if conv.CollectedInfo.Budget != nil && *conv.CollectedInfo.Budget != "" {
		knownParts = append(knownParts, fmt.Sprintf("ngân sách: %s", *conv.CollectedInfo.Budget))
	}
	if conv.CollectedInfo.SchoolType != nil && *conv.CollectedInfo.SchoolType != "" {
		knownParts = append(knownParts, fmt.Sprintf("nhu cầu: %s", *conv.CollectedInfo.SchoolType))
	}
	memory := ""
	if len(knownParts) > 0 {
		memory = "--- THÔNG TIN ĐÃ CÓ ---\n" + strings.Join(knownParts, "\n")
	}

	return ecoPromptInput{
		MemoryContext:    memory,
		CustomerProfile:  "",
		HistoryText:      historyText,
		LastAIPurpose:    lastAIPurpose,
		EffectiveMessage: effective,
		CustomerPronoun:  pronoun,
		PrimaryIntent:    intent,
		CustomerEmotion:  "neutral",
		Strategy:         "continue",
		Confidence:       0.8,
		KnownInfo:        conv.CollectedInfo,
		HasPhoneStop:     conv.CollectedInfo.Phone != nil && *conv.CollectedInfo.Phone != "",
	}
}

func (s *AIResponder) buildGenericSystemPrompt(ctx context.Context, conv models.Conversation, page models.Page) string {
	info := conv.CollectedInfo

	role := derefOr(page.AIRole, "tư vấn viên tuyển sinh")
	industry := derefOr(page.AIIndustry, "giáo dục mầm non")
	tone := derefOr(page.AITone, "thân thiện, vui vẻ, không quá trang trọng, dùng emoji vừa phải")
	priceList := derefOr(page.AIPriceList, "")
	locationInfo := derefOr(page.AILocationInfo, "")
	contactChannel := derefOr(page.AIContactChannel, "")
	extraRules := derefOr(page.AIExtraRules, "")

	var lines []string
	lines = append(lines, fmt.Sprintf("Bạn là %s tại một %s.", role, industry))
	lines = append(lines, fmt.Sprintf("Giọng điệu: %s", tone))
	lines = append(lines, "Nhiệm vụ: trả lời tin nhắn của phụ huynh/khách hàng một cách tự nhiên, không giống chatbot.")
	lines = append(lines, "Nguyên tắc:")
	lines = append(lines, "- Không dùng câu mở đầu robot như 'Chào bạn, cảm ơn bạn đã quan tâm...'")
	lines = append(lines, "- Không tự giới thiệu lại tên trường/nhãn hàng nếu đã chào trong cuộc trò chuyện.")
	lines = append(lines, "- Không kết thúc bằng 'Nếu cần gì thêm hãy liên hệ...' hoặc 'Hân hạnh phục vụ...'")
	lines = append(lines, "- Tuyệt đối không đưa ra số điện thoại, email, địa chỉ giả mạo.")
	lines = append(lines, "- Nếu khách hỏi giá, đưa giá theo bảng giá thực; không nói 'vui lòng liên hệ'.")
	lines = append(lines, "- Trả lời ngắn gọn, tối đa 2-3 câu, phù hợp Messenger.")
	lines = append(lines, "- Sử dụng tiếng Việt có dấu, chính xác.")
	if priceList != "" {
		lines = append(lines, fmt.Sprintf("Bảng giá: %s", priceList))
	}
	if locationInfo != "" {
		lines = append(lines, fmt.Sprintf("Thông tin địa điểm: %s", locationInfo))
	}
	if contactChannel != "" {
		lines = append(lines, fmt.Sprintf("Kênh liên hệ: %s", contactChannel))
	}
	if extraRules != "" {
		lines = append(lines, extraRules)
	}
	if info.Name != nil && *info.Name != "" {
		lines = append(lines, fmt.Sprintf("Tên khách hàng đã biết: %s", *info.Name))
	}
	if info.Phone != nil && *info.Phone != "" {
		lines = append(lines, fmt.Sprintf("SĐT đã biết: %s", *info.Phone))
	}
	if info.Zalo != nil && *info.Zalo != "" {
		lines = append(lines, fmt.Sprintf("Zalo đã biết: %s", *info.Zalo))
	}
	if info.Location != nil && *info.Location != "" {
		lines = append(lines, fmt.Sprintf("Khu vực đã biết: %s", *info.Location))
	}
	if info.Budget != nil && *info.Budget != "" {
		lines = append(lines, fmt.Sprintf("Ngân sách đã biết: %s", *info.Budget))
	}
	if info.SchoolType != nil && *info.SchoolType != "" {
		lines = append(lines, fmt.Sprintf("Nhu cầu đã biết: %s", *info.SchoolType))
	}
	return strings.Join(lines, "\n")
}

func derefOr(s *string, fallback string) string {
	if s != nil && *s != "" {
		return *s
	}
	return fallback
}

func (s *AIResponder) buildHistory(ctx context.Context, convID string, limit int32) ([]ai.Message, error) {
	msgs, err := s.msgRepo.ListByConversation(ctx, convID, limit)
	if err != nil {
		return nil, err
	}
	// msgs are ordered DESC by sent_at; reverse for chronological order.
	var out []ai.Message
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		role := "user"
		if m.IsFromPage {
			role = "assistant"
		}
		out = append(out, ai.Message{Role: role, Content: m.Content})
	}
	return out, nil
}

func (s *AIResponder) callAI(ctx context.Context, system string, history []ai.Message, userText string) (string, error) {
	req := ai.CompletionRequest{
		Model:       s.openai.Model(),
		Temperature: 0.7,
		MaxTokens:   512,
		Messages:    []ai.Message{{Role: "system", Content: system}},
	}
	req.Messages = append(req.Messages, history...)
	// Ensure the last message is the current user turn.
	if len(req.Messages) == 0 || req.Messages[len(req.Messages)-1].Role != "user" {
		req.Messages = append(req.Messages, ai.Message{Role: "user", Content: userText})
	}
	start := time.Now()
	reply, err := s.openai.Complete(ctx, req)
	elapsed := time.Since(start).Seconds()
	telemetry.OpenAILatency.WithLabelValues(s.openai.Model()).Observe(elapsed)
	if err != nil {
		telemetry.AIErrors.WithLabelValues("unknown", "openai_error").Inc()
	}
	s.cb.RecordResult(err == nil && reply != "")
	return reply, err
}

// cleanOutput removes robotic boilerplate, fixes pronouns, and strips
// fabricated contact details that were not actually provided.
func (s *AIResponder) cleanOutput(text string, known models.CollectedInfo) string {
	text = strings.TrimSpace(text)
	// Remove common robotic endings.
	for _, phrase := range []string{
		"Nếu cần gì thêm, hãy liên hệ với chúng tôi.",
		"Nếu cần hỗ trợ thêm, vui lòng liên hệ.",
		"Hân hạnh phục vụ quý khách.",
		"Rất vui được hỗ trợ bạn.",
		"Trân trọng cảm ơn!",
		"Cảm ơn bạn đã quan tâm!",
		"Nếu có thắc mắc gì khác, đừng ngại nhắn lại nhé!",
	} {
		text = strings.ReplaceAll(text, phrase, "")
	}
	// Strip standalone fabricated phone numbers if we don't know one.
	if known.Phone == nil || *known.Phone == "" {
		phoneRe := regexp.MustCompile(`\b0\d{9,10}\b`)
		text = phoneRe.ReplaceAllString(text, "[SĐT]")
	}
	if known.Email == nil || *known.Email == "" {
		emailRe := regexp.MustCompile(`\S+@\S+\.\S+`)
		text = emailRe.ReplaceAllString(text, "[email]")
	}
	// Collapse multiple newlines.
	text = regexp.MustCompile(`\n{2,}`).ReplaceAllString(text, "\n")
	return strings.TrimSpace(text)
}

// ExtractSlots pulls structured data out of raw Vietnamese customer text.
func (s *AIResponder) ExtractSlots(text string) models.CollectedInfo {
	var info models.CollectedInfo
	t := strings.ToLower(text)

	// Phone
	phoneRe := regexp.MustCompile(`\b0\d{9,10}\b`)
	if m := phoneRe.FindString(text); m != "" {
		info.Phone = &m
	}

	// Zalo
	zaloRe := regexp.MustCompile(`(?i)zalo[\s:]+([^\s,\.]+)`)
	if m := zaloRe.FindStringSubmatch(text); len(m) > 1 {
		info.Zalo = &m[1]
	}

	// Email
	emailRe := regexp.MustCompile(`[\w.+-]+@[\w-]+\.[\w.-]+`)
	if m := emailRe.FindString(text); m != "" {
		info.Email = &m
	}

	// Name
	namePatterns := []string{"tên em là", "tên mình là", "tôi tên là", "anh tên là", "chị tên là", "em tên", "mình tên"}
	for _, p := range namePatterns {
		if idx := strings.Index(t, p); idx != -1 {
			after := strings.TrimSpace(text[idx+len(p):])
			// Heuristic: take next 1-3 words.
			words := strings.Fields(after)
			if len(words) > 0 {
				name := strings.Join(words[:minInt(3, len(words))], " ")
				info.Name = &name
				break
			}
		}
	}

	// Location
	locPatterns := []string{"ở", "tại", "khu vực", "quận", "huyện", "thành phố", "tp"}
	for _, p := range locPatterns {
		if idx := strings.Index(t, p); idx != -1 {
			after := strings.TrimSpace(text[idx+len(p):])
			words := strings.Fields(after)
			if len(words) > 0 {
				loc := strings.Join(words[:minInt(5, len(words))], " ")
				info.Location = &loc
				break
			}
		}
	}

	// Budget
	budgetRe := regexp.MustCompile(`(?i)(\d+[\d\s,]*\s*(triệu|tỷ|k|nghìn|tr|đ))`)
	if m := budgetRe.FindString(text); m != "" {
		info.Budget = &m
	}

	return info
}

// ClassifyIntent maps Vietnamese customer text to a business intent.
func (s *AIResponder) ClassifyIntent(text string) string {
	t := strings.ToLower(text)
	switch {
	case containsAny(t, "giá", "học phí", "bao nhiêu tiền", "chi phí", "đắt không", "rẻ không"):
		return "asking_price"
	case containsAny(t, "tệ", "kém", "chán", "thất vọng", "không hài lòng", "tồi tệ", "dở"):
		return "complaint"
	case containsAny(t, "muốn đăng ký", "cho con học", "quan tâm", "tìm hiểu", "muốn biết", "có khóa không", "lịch học"):
		return "interested"
	case containsAny(t, "cảm ơn", "ok", "được", "ừ", "vâng", "dạ"):
		return "general"
	default:
		return "other"
	}
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

func isDirectQuestion(text string) bool {
	return regexp.MustCompile(`(?i)\?(.*có|không|chưa|ở|đâu|nào|bao nhiêu|giá|lâu|mấy)|^([A-Z].*\?)|(có.*không|làm.*chưa|ở.*chưa)`).MatchString(text)
}

func hasStatementPattern(text string) bool {
	return regexp.MustCompile(`(?i)(đã|đang|cần|muốn|có|mới|sắp)\s*(làm|xây|cải tạo|thiết kế|có|ở|cần|muốn)`).MatchString(text)
}

// stopSignals are Vietnamese keywords that indicate the user wants human
// contact or has provided PII (phone, email) — we stop auto-chat to avoid
// annoying them and to let staff take over.
var stopSignals = []string{
	"gọi điện", "gọi cho", "liên hệ", "zalo", "số điện thoại", "sdt", "điện thoại",
	"email", "@", "facebook cá nhân", "fb cá nhân", "inbox riêng", "nhắn riêng",
	"gặp trực tiếp", "tới văn phòng", "địa chỉ", "số nhà", "ngân hàng",
}

// phoneRegex matches common Vietnamese phone number patterns.
var phoneRegex = regexp.MustCompile(`(?i)(\b0[35789]\d{8}\b|\b0\d{9,10}\b|\+84\d{9,10}\b)`)

// emailRegex matches simple email addresses.
var emailRegex = regexp.MustCompile(`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`)

// shouldStopAutoChat returns true if the user message contains signals that
// should hand the conversation over to a human.
func shouldStopAutoChat(text string) (bool, string) {
	lower := strings.ToLower(text)
	for _, sig := range stopSignals {
		if strings.Contains(lower, sig) {
			return true, "stop_signal: " + sig
		}
	}
	if phoneRegex.MatchString(text) {
		return true, "stop_signal: phone_number"
	}
	if emailRegex.MatchString(text) {
		return true, "stop_signal: email"
	}
	return false, ""
}

// scrubPII replaces phone numbers and emails with [REDACTED] so logs stay
// safe. It is best-effort and intended for log fields only.
func scrubPII(text string) string {
	s := phoneRegex.ReplaceAllString(text, "[PHONE]")
	s = emailRegex.ReplaceAllString(s, "[EMAIL]")
	return s
}

