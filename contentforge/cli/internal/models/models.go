package models

import "time"

// ContentType represents the type of content
type ContentType string

const (
	ContentTypeVideo    ContentType = "video"
	ContentTypeArticle  ContentType = "article"
	ContentTypeTweet    ContentType = "tweet"
	ContentTypeThread   ContentType = "thread"
	ContentTypeAudio    ContentType = "audio"
	ContentTypeImage    ContentType = "image"
	ContentTypeNote     ContentType = "note"
)

// ContentStatus represents the lifecycle status of a content unit
type ContentStatus string

const (
	ContentStatusIngested   ContentStatus = "ingested"
	ContentStatusProcessing ContentStatus = "processing"
	ContentStatusProcessed  ContentStatus = "processed"
	ContentStatusEditing    ContentStatus = "editing"
	ContentStatusReady      ContentStatus = "ready"
	ContentStatusPublished  ContentStatus = "published"
	ContentStatusFailed     ContentStatus = "failed"
)

// SourceInfo represents the source of a content unit
type SourceInfo struct {
	Platform    string         `json:"platform"`
	URL         string         `json:"url"`
	Author      string         `json:"author,omitempty"`
	PublishedAt *time.Time     `json:"published_at,omitempty"`
	Engagement  map[string]int `json:"engagement,omitempty"`
}

// ContentUnit represents the core data model
type ContentUnit struct {
	ID              string            `json:"id"`
	Source          SourceInfo        `json:"source"`
	Type            ContentType       `json:"type"`
	Title           string            `json:"title"`
	Description     string            `json:"description"`
	ExtractedText   string            `json:"extracted_text"`
	Summary         string            `json:"summary,omitempty"`
	KeyPoints       []string          `json:"key_points,omitempty"`
	Sentiment       string            `json:"sentiment,omitempty"`
	Topics          []string          `json:"topics,omitempty"`
	TranslatedText  string            `json:"translated_text,omitempty"`
	RewrittenText   string            `json:"rewritten_text,omitempty"`
	Status          ContentStatus     `json:"status"`
	PipelineID      string            `json:"pipeline_id,omitempty"`
	Tags            []string          `json:"tags,omitempty"`
	FilePath        string            `json:"file_path,omitempty"`
	RawMetadata     map[string]interface{} `json:"raw_metadata,omitempty"`
	Error           string            `json:"error,omitempty"`
	CreatedAt       time.Time         `json:"created_at"`
	UpdatedAt       time.Time         `json:"updated_at"`
}

// PipelineStep represents a single step in a pipeline
type PipelineStep struct {
	ID             string                 `json:"id"`
	Type           string                 `json:"type"`
	Config         map[string]interface{} `json:"config,omitempty"`
	InputMapping   map[string]string      `json:"input_mapping,omitempty"`
	OutputMapping  map[string]string      `json:"output_mapping,omitempty"`
	MaxRetries     int                    `json:"max_retries"`
	Backoff        string                 `json:"backoff"`
	DelayMs        int                    `json:"delay_ms"`
	Condition      string                 `json:"condition,omitempty"`
	TimeoutMs      int                    `json:"timeout_ms"`
}

// Pipeline represents a content processing pipeline
type Pipeline struct {
	ID            string                 `json:"id"`
	Name          string                 `json:"name"`
	Description   string                 `json:"description,omitempty"`
	Steps         []PipelineStep         `json:"steps"`
	Trigger       string                 `json:"trigger"`
	Schedule      string                 `json:"schedule,omitempty"`
	InputConfig   map[string]interface{} `json:"input_config,omitempty"`
	OutputConfig  map[string]interface{} `json:"output_config,omitempty"`
	Enabled       bool                   `json:"enabled"`
	LastRunAt     *time.Time             `json:"last_run_at,omitempty"`
	RunCount      int                    `json:"run_count"`
	FailCount     int                    `json:"fail_count"`
	CreatedAt     time.Time              `json:"created_at"`
}

// PipelineRun represents an execution of a pipeline
type PipelineRun struct {
	ID             string            `json:"id"`
	PipelineID     string            `json:"pipeline_id"`
	Status         string            `json:"status"`
	StartedAt      time.Time         `json:"started_at"`
	CompletedAt    *time.Time        `json:"completed_at,omitempty"`
	Steps          []map[string]interface{} `json:"steps,omitempty"`
	InputUnitIDs   []string          `json:"input_unit_ids,omitempty"`
	OutputUnitIDs  []string          `json:"output_unit_ids,omitempty"`
	Logs           []string          `json:"logs,omitempty"`
	Error          string            `json:"error,omitempty"`
}
