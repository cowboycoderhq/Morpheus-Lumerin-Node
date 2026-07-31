package chatstorage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	gcs "github.com/MorpheusAIs/Morpheus-Lumerin-Node/proxy-router/internal/chatstorage/genericchatstorage"
)

// ChatStorage handles storing conversations to files.
type ChatStorage struct {
	dirPath string // Directory path to store the files
	// Guards the fileMutexes MAP itself. The per-file mutexes serialise writes to
	// one chat file; they do nothing for concurrent access to the map holding
	// them. initFileMutex read-then-wrote it while other goroutines were reading
	// it, which in Go is not a benign race — the runtime throws "concurrent map
	// writes" and takes the whole proxy-router down, killing inference for every
	// live session while their stakes keep burning time. Two prompts for
	// DIFFERENT chats at once is all it takes, which concurrent rolling sessions
	// turn from a rarity into the normal usage pattern.
	mutexesMu          sync.Mutex
	fileMutexes        map[string]*sync.Mutex // Map to store mutexes for each file
	forwardChatContext bool
}

// NewChatStorage creates a new instance of ChatStorage.
func NewChatStorage(dirPath string) *ChatStorage {
	return &ChatStorage{
		dirPath:     dirPath,
		fileMutexes: make(map[string]*sync.Mutex),
	}
}

// StorePromptResponseToFile stores the prompt and response to a file.
func (cs *ChatStorage) StorePromptResponseToFile(identifier string, isLocal bool, modelId string, sessionId string, prompt interface{}, responses []gcs.Chunk, promptAt time.Time, responseAt time.Time) error {
	if err := os.MkdirAll(cs.dirPath, os.ModePerm); err != nil {
		return err
	}

	filePath := filepath.Join(cs.dirPath, identifier+".json")
	mu := cs.fileMutex(filePath)
	mu.Lock()
	defer mu.Unlock()

	var chatHistory gcs.ChatHistory
	if _, err := os.Stat(filePath); err == nil {
		fileContent, err := os.ReadFile(filePath)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(fileContent, &chatHistory); err != nil {
			return err
		}
	}

	resps := make([]string, len(responses))
	for i, r := range responses {
		resps[i] = r.String()
	}

	isImageContent := false
	isVideoRawContent := false
	isAudioContent := false
	if len(responses) > 0 {
		isImageContent = responses[0].Type() == gcs.ChunkTypeImage
		isVideoRawContent = responses[0].Type() == gcs.ChunkTypeVideo
		isAudioContent = responses[0].Type() == gcs.ChunkTypeAudioTranscriptionText ||
			responses[0].Type() == gcs.ChunkTypeAudioTranscriptionJson ||
			responses[0].Type() == gcs.ChunkTypeAudioTranscriptionDelta
	}

	var newEntry gcs.ChatMessage
	var title string

	switch p := prompt.(type) {
	case *gcs.OpenAICompletionRequestExtra:
		newEntry = gcs.ChatMessage{
			Prompt:            prompt,
			Response:          strings.Join(resps, ""),
			PromptAt:          promptAt.Unix(),
			ResponseAt:        responseAt.Unix(),
			IsImageContent:    isImageContent,
			IsVideoRawContent: isVideoRawContent,
			IsAudioContent:    isAudioContent,
		}
		title = p.Messages[0].Content
	case *gcs.AudioTranscriptionRequest:
		// Store audio transcription request directly
		newEntry = gcs.ChatMessage{
			Prompt:            p,
			Response:          strings.Join(resps, ""),
			PromptAt:          promptAt.Unix(),
			ResponseAt:        responseAt.Unix(),
			IsImageContent:    isImageContent,
			IsVideoRawContent: isVideoRawContent,
			IsAudioContent:    isAudioContent,
		}
		// Use a default title for audio transcription or the prompt if available
		if p.Prompt != "" {
			title = "Audio Transcription: " + p.Prompt
		} else {
			title = "Audio Transcription"
		}
	case *gcs.EmbeddingsRequest:
		newEntry = gcs.ChatMessage{
			Prompt:            p,
			Response:          strings.Join(resps, ""),
			PromptAt:          promptAt.Unix(),
			ResponseAt:        responseAt.Unix(),
			IsImageContent:    isImageContent,
			IsVideoRawContent: isVideoRawContent,
			IsAudioContent:    isAudioContent,
		}
	case *gcs.AudioSpeechRequest:
		// Store audio speech request directly
		newEntry = gcs.ChatMessage{
			Prompt:            p,
			Response:          strings.Join(resps, ""),
			PromptAt:          promptAt.Unix(),
			ResponseAt:        responseAt.Unix(),
			IsImageContent:    isImageContent,
			IsVideoRawContent: isVideoRawContent,
			IsAudioContent:    isAudioContent,
		}
	default:
		return fmt.Errorf("unsupported prompt type: %T", prompt)
	}

	if chatHistory.Messages == nil && len(chatHistory.Messages) == 0 {
		chatHistory.ModelId = modelId
		chatHistory.Title = title
		chatHistory.IsLocal = isLocal
	}

	// Updated on EVERY write, not only the first, because a chat outlives the
	// session serving it: sessions expire and the user opens another for the same
	// thread. Pinning it once would leave the chat bound to a dead session.
	//
	// Guarded on non-empty so a turn that carries no session (a local model, or a
	// request with no session_id header) cannot erase a good binding — silently
	// unbinding a chat would send the next prompt with session_id=undefined.
	if sessionId != "" {
		chatHistory.SessionID = sessionId
	}

	newMessages := append(chatHistory.Messages, newEntry)
	chatHistory.Messages = newMessages

	updatedContent, err := json.MarshalIndent(chatHistory, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(filePath, updatedContent, 0644); err != nil {
		return err
	}

	return nil
}

func (cs *ChatStorage) GetChats() []gcs.Chat {
	var chats []gcs.Chat
	files, err := os.ReadDir(cs.dirPath)
	if err != nil {
		return chats
	}

	for _, file := range files {
		if file.IsDir() {
			continue
		}

		chatID := file.Name()
		chatID = chatID[:len(chatID)-5]

		fileContent, err := cs.LoadChatFromFile(chatID)
		if err != nil {
			continue
		}
		// Messages[0] unguarded panicked on a zero-message file, and gin is built
		// with gin.New() (no Recovery middleware), so one such file took out the
		// whole request. This list is now the sole carrier of every chat's session
		// binding — losing it wholesale is far worse than skipping one odd file.
		var createdAt int64
		if len(fileContent.Messages) > 0 {
			createdAt = fileContent.Messages[0].PromptAt
		}
		chats = append(chats, gcs.Chat{
			ChatID:    chatID,
			Title:     fileContent.Title,
			CreatedAt: createdAt,
			ModelID:   fileContent.ModelId,
			IsLocal:   fileContent.IsLocal,
			SessionID: fileContent.SessionID,
		})
	}

	return chats
}

func (cs *ChatStorage) DeleteChat(identifier string) error {
	filePath := filepath.Join(cs.dirPath, identifier+".json")
	mu := cs.fileMutex(filePath)
	mu.Lock()
	defer mu.Unlock()

	if err := os.Remove(filePath); err != nil {
		return err
	}
	return nil
}

func (cs *ChatStorage) UpdateChatTitle(identifier string, title string) error {
	chat, err := cs.LoadChatFromFile(identifier)
	if err != nil {
		return err
	}
	chat.Title = title

	filePath := filepath.Join(cs.dirPath, identifier+".json")
	mu := cs.fileMutex(filePath)
	mu.Lock()
	defer mu.Unlock()

	updatedContent, err := json.MarshalIndent(chat, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(filePath, updatedContent, 0644); err != nil {
		return err
	}

	return nil
}

func (cs *ChatStorage) LoadChatFromFile(identifier string) (*gcs.ChatHistory, error) {
	filePath := filepath.Join(cs.dirPath, identifier+".json")
	mu := cs.fileMutex(filePath)
	mu.Lock()
	defer mu.Unlock()

	var data gcs.ChatHistory
	fileContent, err := os.ReadFile(filePath)
	if err != nil {
		return &data, err
	}

	if err := json.Unmarshal(fileContent, &data); err != nil {
		return nil, err
	}

	return &data, nil
}

// fileMutex returns the mutex for filePath, creating it if absent. Both the
// lookup and the insert happen under mutexesMu, so the map is never read while
// another goroutine writes it. Returning the mutex (rather than having callers
// re-index the map afterwards) is what makes that guarantee hold end to end —
// an unguarded `cs.fileMutexes[filePath].Lock()` at the call site would put the
// read straight back.
func (cs *ChatStorage) fileMutex(filePath string) *sync.Mutex {
	cs.mutexesMu.Lock()
	defer cs.mutexesMu.Unlock()
	mu, exists := cs.fileMutexes[filePath]
	if !exists {
		mu = &sync.Mutex{}
		cs.fileMutexes[filePath] = mu
	}
	return mu
}
