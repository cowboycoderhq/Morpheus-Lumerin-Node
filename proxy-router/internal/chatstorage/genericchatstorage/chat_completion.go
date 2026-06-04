package genericchatstorage

import (
	"encoding/json"
	"reflect"
	"strings"

	"github.com/MorpheusAIs/Morpheus-Lumerin-Node/proxy-router/internal/lib"
	"github.com/sashabaranov/go-openai"
)

// reasoningDetail mirrors one entry of OpenRouter's structured "reasoning_details"
// array, which is used (alongside or instead of the plain "reasoning" string) for
// models that emit summaries or encrypted chain-of-thought. Only the textual parts
// are relevant for token counting.
type reasoningDetail struct {
	Text    string `json:"text"`
	Summary string `json:"summary"`
	Data    string `json:"data"`
}

// joinReasoningDetails concatenates the textual fields of a reasoning_details array.
func joinReasoningDetails(details []reasoningDetail) string {
	var b strings.Builder
	for _, d := range details {
		b.WriteString(d.Text)
		b.WriteString(d.Summary)
		b.WriteString(d.Data)
	}
	return b.String()
}

type OpenAICompletionRequestExtra struct {
	openai.ChatCompletionRequest
	Extra map[string]json.RawMessage `json:"-"`
}

func (c *OpenAICompletionRequestExtra) UnmarshalJSON(data []byte) error {
	type base openai.ChatCompletionRequest
	var known base
	if err := json.Unmarshal(data, &known); err != nil {
		return err
	}
	c.ChatCompletionRequest = openai.ChatCompletionRequest(known)

	var all map[string]json.RawMessage
	if err := json.Unmarshal(data, &all); err != nil {
		return err
	}
	lib.StripKnownKeys(all, reflect.TypeOf(known))
	c.Extra = all
	return nil
}

func (c OpenAICompletionRequestExtra) MarshalJSON() ([]byte, error) {
	type base openai.ChatCompletionRequest
	b, err := json.Marshal(base(c.ChatCompletionRequest))
	if err != nil {
		return nil, err
	}

	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	for k, v := range c.Extra {
		m[k] = v
	}
	return json.Marshal(m)
}

// ChatCompletionResponse preserves the standard OpenAI response *and* any extra keys.
type ChatCompletionResponseExtra struct {
	openai.ChatCompletionResponse                            // typed, known part
	Extra                         map[string]json.RawMessage `json:"-"` // unknown bits
	originalJSON                  map[string]json.RawMessage // preserve original structure
}

func (c *ChatCompletionResponseExtra) UnmarshalJSON(data []byte) error {
	// 1) Unmarshal into the embedded OpenAI struct (using an alias to avoid recursion)
	type base openai.ChatCompletionResponse
	var known base
	if err := json.Unmarshal(data, &known); err != nil {
		return err
	}
	c.ChatCompletionResponse = openai.ChatCompletionResponse(known)

	// 2) Unmarshal into a generic map so we can see every key
	var all map[string]json.RawMessage
	if err := json.Unmarshal(data, &all); err != nil {
		return err
	}

	// Store the original JSON structure to preserve exact formatting
	c.originalJSON = make(map[string]json.RawMessage)
	for k, v := range all {
		c.originalJSON[k] = v
	}

	// 3) Delete the keys we already mapped into the typed struct
	lib.StripKnownKeys(all, reflect.TypeOf(known))

	// Whatever is left is vendor-specific
	c.Extra = all
	return nil
}

func (c ChatCompletionResponseExtra) MarshalJSON() ([]byte, error) {
	// Use the original JSON structure if available (preserves original fields and omits defaults)
	if c.originalJSON != nil {
		m := make(map[string]json.RawMessage)
		for k, v := range c.originalJSON {
			m[k] = v
		}
		
		// Merge vendor-specific keys from Extra if they were modified
		for k, v := range c.Extra {
			m[k] = v
		}
		
		return json.Marshal(m)
	}

	// Fallback to the old method if originalJSON is not available
	// (e.g., if the struct was created programmatically)
	type base openai.ChatCompletionResponse
	b, err := json.Marshal(base(c.ChatCompletionResponse))
	if err != nil {
		return nil, err
	}

	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}

	for k, v := range c.Extra {
		m[k] = v
	}

	return json.Marshal(m)
}

// ReasoningContent returns the message reasoning field from the original JSON,
// if present. Reasoning ("thinking") models return chain-of-thought here
// separately from the answer content (choices[].message.content). Providers
// disagree on the field name: Venice/DeepSeek use "reasoning_content" while
// ollama/gpt-oss use "reasoning".
func (c *ChatCompletionResponseExtra) ReasoningContent() string {
	if c.originalJSON == nil {
		return ""
	}
	raw := c.originalJSON["choices"]
	if raw == nil {
		return ""
	}
	var choices []struct {
		Message struct {
			ReasoningContent string            `json:"reasoning_content"`
			Reasoning        string            `json:"reasoning"`
			ReasoningDetails []reasoningDetail `json:"reasoning_details"`
		} `json:"message"`
	}
	if err := json.Unmarshal(raw, &choices); err != nil || len(choices) == 0 {
		return ""
	}
	m := choices[0].Message
	if m.ReasoningContent != "" {
		return m.ReasoningContent
	}
	if m.Reasoning != "" {
		return m.Reasoning
	}
	return joinReasoningDetails(m.ReasoningDetails)
}

// SetOriginalJSONUsage updates the usage field in originalJSON
func (c *ChatCompletionResponseExtra) SetOriginalJSONUsage(usageBytes []byte) {
	if c.originalJSON == nil {
		c.originalJSON = make(map[string]json.RawMessage)
	}
	c.originalJSON["usage"] = usageBytes
}

// SetCustomUsage sets a custom usage field (usage_from_provider or usage_from_consumer) in Extra map
// Does NOT modify the original "usage" field from the LLM
func (c *ChatCompletionResponseExtra) SetCustomUsage(fieldName string, promptTokens, completionTokens int) {
	if c.Extra == nil {
		c.Extra = make(map[string]json.RawMessage)
	}
	usage := map[string]int{
		"prompt_tokens":     promptTokens,
		"completion_tokens": completionTokens,
		"total_tokens":      promptTokens + completionTokens,
	}
	usageBytes, err := json.Marshal(usage)
	if err == nil {
		c.Extra[fieldName] = usageBytes
	}
}

type ChatCompletionStreamResponseExtra struct {
	openai.ChatCompletionStreamResponse                            // typed, known part
	Extra                               map[string]json.RawMessage `json:"-"` // unknown bits
	originalJSON                        map[string]json.RawMessage // preserve original structure
}

func (c *ChatCompletionStreamResponseExtra) UnmarshalJSON(data []byte) error {
	// 1) Unmarshal into the embedded OpenAI struct (using an alias to avoid recursion)
	type base openai.ChatCompletionStreamResponse
	var known base
	if err := json.Unmarshal(data, &known); err != nil {
		return err
	}
	c.ChatCompletionStreamResponse = openai.ChatCompletionStreamResponse(known)

	// 2) Unmarshal into a generic map so we can see every key
	var all map[string]json.RawMessage
	if err := json.Unmarshal(data, &all); err != nil {
		return err
	}

	// Store the original JSON structure to preserve exact formatting
	c.originalJSON = make(map[string]json.RawMessage)
	for k, v := range all {
		c.originalJSON[k] = v
	}

	// 3) Delete the keys we already mapped into the typed struct
	lib.StripKnownKeys(all, reflect.TypeOf(known))

	// Whatever is left is vendor-specific
	c.Extra = all
	return nil
}

func (c ChatCompletionStreamResponseExtra) MarshalJSON() ([]byte, error) {
	// Use the original JSON structure if available (preserves original fields and omits defaults)
	if c.originalJSON != nil {
		m := make(map[string]json.RawMessage)
		for k, v := range c.originalJSON {
			m[k] = v
		}
		
		// Merge vendor-specific keys from Extra if they were modified
		for k, v := range c.Extra {
			m[k] = v
		}
		
		return json.Marshal(m)
	}

	// Fallback to the old method if originalJSON is not available
	// (e.g., if the struct was created programmatically)
	type base openai.ChatCompletionStreamResponse
	b, err := json.Marshal(base(c.ChatCompletionStreamResponse))
	if err != nil {
		return nil, err
	}

	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}

	for k, v := range c.Extra {
		m[k] = v
	}

	return json.Marshal(m)
}

// SetOriginalJSONUsage updates the usage field in originalJSON
// OriginalChoicesJSON returns the raw JSON for the "choices" key from the
// original unmarshaled data, preserving provider-specific delta fields like
// reasoning_content that the typed struct doesn't capture.
func (c *ChatCompletionStreamResponseExtra) OriginalChoicesJSON() json.RawMessage {
	if c.originalJSON == nil {
		return nil
	}
	return c.originalJSON["choices"]
}

// ReasoningContent returns the delta reasoning field from the original JSON,
// if present. Reasoning ("thinking") models stream chain-of-thought separately
// from the answer content. Providers disagree on the field name: Venice/DeepSeek
// use "reasoning_content" while ollama/gpt-oss use "reasoning".
func (c *ChatCompletionStreamResponseExtra) ReasoningContent() string {
	raw := c.OriginalChoicesJSON()
	if raw == nil {
		return ""
	}
	var choices []struct {
		Delta struct {
			ReasoningContent string            `json:"reasoning_content"`
			Reasoning        string            `json:"reasoning"`
			ReasoningDetails []reasoningDetail `json:"reasoning_details"`
		} `json:"delta"`
	}
	if err := json.Unmarshal(raw, &choices); err != nil || len(choices) == 0 {
		return ""
	}
	d := choices[0].Delta
	if d.ReasoningContent != "" {
		return d.ReasoningContent
	}
	if d.Reasoning != "" {
		return d.Reasoning
	}
	return joinReasoningDetails(d.ReasoningDetails)
}

func (c *ChatCompletionStreamResponseExtra) SetOriginalJSONUsage(usageBytes []byte) {
	if c.originalJSON == nil {
		c.originalJSON = make(map[string]json.RawMessage)
	}
	c.originalJSON["usage"] = usageBytes
}

// SetCustomUsage sets a custom usage field (usage_from_provider or usage_from_consumer) in Extra map
// Does NOT modify the original "usage" field from the LLM
func (c *ChatCompletionStreamResponseExtra) SetCustomUsage(fieldName string, promptTokens, completionTokens int) {
	if c.Extra == nil {
		c.Extra = make(map[string]json.RawMessage)
	}
	usage := map[string]int{
		"prompt_tokens":     promptTokens,
		"completion_tokens": completionTokens,
		"total_tokens":      promptTokens + completionTokens,
	}
	usageBytes, err := json.Marshal(usage)
	if err == nil {
		c.Extra[fieldName] = usageBytes
	}
}
