package telemetry

import (
	"github.com/prometheus/client_golang/prometheus"
)

var (
	// Registry is the application-wide Prometheus registry.
	Registry = prometheus.NewRegistry()

	// WebhookReceived counts Facebook webhook POST deliveries.
	WebhookReceived = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "facebook_webhook_received_total",
		Help: "Total number of Facebook webhook events received",
	}, []string{"event_type"})

	// WebhookProcessed counts events that finished processing.
	WebhookProcessed = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "facebook_webhook_processed_total",
		Help: "Total number of Facebook webhook events processed",
	}, []string{"event_type", "status"})

	// AIReplies counts AI-generated outbound messages.
	AIReplies = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "facebook_ai_replies_total",
		Help: "Total number of AI auto-replies sent",
	}, []string{"page_id"})

	// AIErrors counts AI reply failures.
	AIErrors = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "facebook_ai_errors_total",
		Help: "Total number of AI reply failures",
	}, []string{"page_id", "reason"})

	// OpenAILatency tracks OpenAI call duration.
	OpenAILatency = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "facebook_openai_latency_seconds",
		Help:    "Latency of OpenAI completion calls",
		Buckets: prometheus.DefBuckets,
	}, []string{"model"})

	// GraphAPICalls counts outgoing Graph API requests.
	GraphAPICalls = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "facebook_graph_api_calls_total",
		Help: "Total number of Facebook Graph API calls",
	}, []string{"method", "endpoint"})

	// GraphAPIErrors counts Graph API call failures.
	GraphAPIErrors = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "facebook_graph_api_errors_total",
		Help: "Total number of Facebook Graph API call failures",
	}, []string{"method", "endpoint", "code"})
)

func init() {
	Registry.MustRegister(
		WebhookReceived,
		WebhookProcessed,
		AIReplies,
		AIErrors,
		OpenAILatency,
		GraphAPICalls,
		GraphAPIErrors,
	)
}
