package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestScrubPII(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"SĐT của em là 0987654321", "SĐT của em là [PHONE]"},
		{"Email: hello@example.com", "Email: [EMAIL]"},
		{"Liên hệ +84987654321 hoặc mail@domain.vn", "Liên hệ [PHONE] hoặc [EMAIL]"},
		{"Không có gì cả", "Không có gì cả"},
		{"", ""},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := scrubPII(tt.input)
			assert.Equal(t, tt.expected, got)
		})
	}
}

func TestShouldStopAutoChat(t *testing.T) {
	tests := []struct {
		text        string
		wantStop    bool
		wantReason  string
	}{
		{"gọi điện cho tôi", true, "stop_signal: gọi điện"},
		{"zalo em nhé", true, "stop_signal: zalo"},
		{"sdt của tôi là 0987654321", true, "stop_signal: sdt"},
		{"email: test@example.com", true, "stop_signal: email"},
		{"cho em hỏi giá", false, ""},
		{"ok", false, ""},
	}
	for _, tt := range tests {
		t.Run(tt.text, func(t *testing.T) {
			stop, reason := shouldStopAutoChat(tt.text)
			assert.Equal(t, tt.wantStop, stop)
			assert.Equal(t, tt.wantReason, reason)
		})
	}
}

func TestCleanOutputEcoHome(t *testing.T) {
	tests := []struct {
		name         string
		text         string
		pronoun      string
		lastAssistant string
		recent       []string
		userMsg      string
		isDirectQ    bool
		hasStatement bool
		wantContent  string
		wantNoReply  bool
	}{
		{
			name:         "strip analysis text",
			text:         "Khách đang cần tư vấn. Dạ, anh/chị cần gì ạ?",
			pronoun:      "a/c",
			lastAssistant: "",
			recent:       nil,
			userMsg:      "hello",
			isDirectQ:    false,
			hasStatement: false,
			wantContent:  "Dạ, a/c cần gì ạ?",
			wantNoReply:  false,
		},
		{
			name:         "enforce pronoun anh",
			text:         "Dạ, anh/chị cần gì ạ?",
			pronoun:      "anh",
			lastAssistant: "",
			recent:       nil,
			userMsg:      "hello",
			isDirectQ:    false,
			hasStatement: false,
			wantContent:  "Dạ, anh cần gì ạ?",
			wantNoReply:  false,
		},
		{
			name:         "no reply signal",
			text:         "[no_reply]",
			pronoun:      "a/c",
			lastAssistant: "",
			recent:       nil,
			userMsg:      "spam",
			isDirectQ:    false,
			hasStatement: false,
			wantContent:  "",
			wantNoReply:  true,
		},
		{
			name:         "fabrication guard",
			text:         "Bên em đã có 50 công trình tại Hà Nội",
			pronoun:      "a/c",
			lastAssistant: "",
			recent:       nil,
			userMsg:      "có kinh nghiệm không",
			isDirectQ:    false,
			hasStatement: false,
			wantContent:  "",
			wantNoReply:  false, // fabrication triggers replacement, not no-reply
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CleanOutputEcoHome(tt.text, tt.pronoun, tt.lastAssistant, tt.recent, tt.userMsg, tt.isDirectQ, tt.hasStatement)
			if tt.wantNoReply {
				require.True(t, result.WantsNoReply, "expected WantsNoReply")
			} else {
				assert.Contains(t, result.Content, tt.wantContent)
			}
		})
	}
}
