package chatstorage

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	gcs "github.com/MorpheusAIs/Morpheus-Lumerin-Node/proxy-router/internal/chatstorage/genericchatstorage"
	openai "github.com/sashabaranov/go-openai"
)

func prompt(text string) *gcs.OpenAICompletionRequestExtra {
	return &gcs.OpenAICompletionRequestExtra{
		ChatCompletionRequest: openai.ChatCompletionRequest{
			Messages: []openai.ChatCompletionMessage{{Role: "user", Content: text}},
		},
	}
}

// Concurrent writes to DIFFERENT chats must not race on the fileMutexes map.
//
// The per-file mutexes serialise writes to a single chat file but say nothing
// about the map holding them: the old initFileMutex read-then-wrote it while
// other goroutines indexed it. In Go that is not a benign race — the runtime
// throws "concurrent map writes" and the whole proxy-router dies, killing
// inference for every live session while their stakes keep burning time.
//
// Concurrent rolling sessions turn "two prompts for different chats at once"
// from a rarity into the normal usage pattern, which is what makes this
// reachable. Run with -race.
func TestConcurrentWritesToDifferentChatsDoNotRaceOnTheMutexMap(t *testing.T) {
	cs := NewChatStorage(t.TempDir())

	const chats = 24
	const turnsPerChat = 6

	var wg sync.WaitGroup
	errs := make(chan error, chats*turnsPerChat)
	start := make(chan struct{})

	for c := 0; c < chats; c++ {
		for n := 0; n < turnsPerChat; n++ {
			wg.Add(1)
			go func(c, n int) {
				defer wg.Done()
				<-start // release together, to maximise map contention
				err := cs.StorePromptResponseToFile(
					fmt.Sprintf("chat%02d", c),
					false,
					"0xmodel",
					fmt.Sprintf("0xsess%02d", c),
					prompt(fmt.Sprintf("turn %d", n)),
					nil,
					time.Now(),
					time.Now(),
				)
				if err != nil {
					errs <- err
				}
			}(c, n)
		}
	}
	close(start)
	wg.Wait()
	close(errs)

	for err := range errs {
		t.Fatalf("concurrent store failed: %v", err)
	}

	// Every chat must have survived with its own binding intact — a lost or
	// cross-written sessionId is the misbilling this field exists to prevent.
	for c := 0; c < chats; c++ {
		id := fmt.Sprintf("chat%02d", c)
		h, err := cs.LoadChatFromFile(id)
		if err != nil {
			t.Fatalf("%s: load failed: %v", id, err)
		}
		want := fmt.Sprintf("0xsess%02d", c)
		if h.SessionID != want {
			t.Errorf("%s: SessionID = %q, want %q", id, h.SessionID, want)
		}
	}
}

// An empty session id must never erase an existing binding: a local-model turn,
// or any request without a session_id header, would otherwise silently unbind a
// paid session and send the next prompt with session_id=undefined.
func TestEmptySessionIDDoesNotEraseAnExistingBinding(t *testing.T) {
	cs := NewChatStorage(t.TempDir())
	now := time.Now()

	if err := cs.StorePromptResponseToFile("chatA", false, "0xmodel", "0xsessA", prompt("one"), nil, now, now); err != nil {
		t.Fatalf("first store: %v", err)
	}
	if err := cs.StorePromptResponseToFile("chatA", true, "0xlocal", "", prompt("two"), nil, now, now); err != nil {
		t.Fatalf("second store: %v", err)
	}

	h, err := cs.LoadChatFromFile("chatA")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if h.SessionID != "0xsessA" {
		t.Errorf("binding was erased by an empty session id: got %q", h.SessionID)
	}
}

// A later non-empty id replaces the earlier one: a chat outlives the session
// serving it, so pinning the first would leave it bound to a dead session.
func TestSessionIDRotatesWithTheServingSession(t *testing.T) {
	cs := NewChatStorage(t.TempDir())
	now := time.Now()

	for _, id := range []string{"0xblock1", "0xblock2", "0xblock3"} {
		if err := cs.StorePromptResponseToFile("chatR", false, "0xmodel", id, prompt("turn"), nil, now, now); err != nil {
			t.Fatalf("store %s: %v", id, err)
		}
	}

	h, err := cs.LoadChatFromFile("chatR")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if h.SessionID != "0xblock3" {
		t.Errorf("SessionID = %q, want the most recent block 0xblock3", h.SessionID)
	}
}

// GetChats must not panic on a chat file with no messages. It is now the sole
// carrier of every chat's session binding, and gin runs without Recovery, so a
// panic here blanks the whole list rather than skipping one file.
func TestGetChatsToleratesAZeroMessageChatFile(t *testing.T) {
	dir := t.TempDir()
	cs := NewChatStorage(dir)
	now := time.Now()

	if err := cs.StorePromptResponseToFile("chatGood", false, "0xmodel", "0xsessG", prompt("hi"), nil, now, now); err != nil {
		t.Fatalf("store: %v", err)
	}
	if err := writeFile(dir, "chatEmpty.json", `{"title":"t","modelId":"m","isLocal":false,"sessionId":"0xsessE","messages":[]}`); err != nil {
		t.Fatalf("write empty: %v", err)
	}

	got := cs.GetChats() // must not panic
	found := false
	for _, c := range got {
		if c.ChatID == "chatGood" && c.SessionID == "0xsessG" {
			found = true
		}
	}
	if !found {
		t.Errorf("the healthy chat was lost from the list: %+v", got)
	}
}

func writeFile(dir, name, content string) error {
	return os.WriteFile(filepath.Join(dir, name), []byte(content), 0644)
}

// The binding must be recordable BEFORE any prompt exists — that is the whole
// point: the stake is spent at open, so waiting for the first message leaves a
// paid session unrecorded for as long as the user does not type.
func TestUpdateChatSessionCreatesTheFileBeforeAnyPrompt(t *testing.T) {
	cs := NewChatStorage(t.TempDir())

	if err := cs.UpdateChatSession("chatNew", "0xsess1", "0xmodelX"); err != nil {
		t.Fatalf("bind: %v", err)
	}
	h, err := cs.LoadChatFromFile("chatNew")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if h.SessionID != "0xsess1" {
		t.Errorf("SessionID = %q, want 0xsess1", h.SessionID)
	}
	if len(h.Messages) != 0 {
		t.Errorf("expected a zero-message chat, got %d", len(h.Messages))
	}
	// A zero-message chat must not break the list that now carries every binding.
	for _, c := range cs.GetChats() {
		if c.ChatID == "chatNew" && c.SessionID != "0xsess1" {
			t.Errorf("GetChats lost the binding: %+v", c)
		}
	}
}

// Rolling sessions rotate every ~305s; the binding names the CURRENT block.
func TestUpdateChatSessionRotates(t *testing.T) {
	cs := NewChatStorage(t.TempDir())
	for _, id := range []string{"0xb1", "0xb2", "0xb3"} {
		if err := cs.UpdateChatSession("chatR", id, "0xmodelX"); err != nil {
			t.Fatalf("bind %s: %v", id, err)
		}
	}
	h, _ := cs.LoadChatFromFile("chatR")
	if h.SessionID != "0xb3" {
		t.Errorf("SessionID = %q, want the newest block 0xb3", h.SessionID)
	}
}

// Binding must never destroy an existing transcript, and an empty id must never
// erase a good binding.
func TestUpdateChatSessionPreservesMessagesAndIgnoresEmpty(t *testing.T) {
	cs := NewChatStorage(t.TempDir())
	now := time.Now()
	if err := cs.StorePromptResponseToFile("chatT", false, "0xmodel", "0xsessA", prompt("hi"), nil, now, now); err != nil {
		t.Fatalf("store: %v", err)
	}
	if err := cs.UpdateChatSession("chatT", "0xsessB", "0xmodelX"); err != nil {
		t.Fatalf("bind: %v", err)
	}
	h, _ := cs.LoadChatFromFile("chatT")
	if len(h.Messages) != 1 {
		t.Fatalf("binding destroyed the transcript: %d messages", len(h.Messages))
	}
	if h.SessionID != "0xsessB" {
		t.Errorf("SessionID = %q, want 0xsessB", h.SessionID)
	}
	if h.Title == "" || h.ModelId == "" {
		t.Errorf("binding dropped metadata: title=%q model=%q", h.Title, h.ModelId)
	}
	if err := cs.UpdateChatSession("chatT", "", "0xmodelX"); err != nil {
		t.Fatalf("empty bind: %v", err)
	}
	h2, _ := cs.LoadChatFromFile("chatT")
	if h2.SessionID != "0xsessB" {
		t.Errorf("an empty id erased the binding: %q", h2.SessionID)
	}
}

// A binding placeholder must not cost the chat its title/model. The first-prompt
// metadata write was gated on `Messages == nil`, and the placeholder creates the
// file with an empty-but-non-nil slice — which would have left every
// bound-before-typed chat permanently untitled in the list.
func TestBindingPlaceholderDoesNotBlockFirstPromptMetadata(t *testing.T) {
	cs := NewChatStorage(t.TempDir())
	now := time.Now()

	if err := cs.UpdateChatSession("chatP", "0xsess1", "0xmodelX"); err != nil {
		t.Fatalf("bind: %v", err)
	}
	if err := cs.StorePromptResponseToFile("chatP", false, "0xmodelX", "0xsess1", prompt("first words"), nil, now, now); err != nil {
		t.Fatalf("store: %v", err)
	}
	h, _ := cs.LoadChatFromFile("chatP")
	if h.Title != "first words" {
		t.Errorf("title never set after a placeholder: %q", h.Title)
	}
	if h.ModelId != "0xmodelX" {
		t.Errorf("modelId never set after a placeholder: %q", h.ModelId)
	}
}

// GetChats must survive junk in the chats directory. It carries every chat's
// session binding, and gin runs without Recovery, so a panic here blanks the
// whole list rather than skipping one file.
func TestGetChatsIgnoresNonJsonAndShortFilenames(t *testing.T) {
	dir := t.TempDir()
	cs := NewChatStorage(dir)
	now := time.Now()
	if err := cs.StorePromptResponseToFile("chatGood", false, "0xmodel", "0xsessG", prompt("hi"), nil, now, now); err != nil {
		t.Fatalf("store: %v", err)
	}
	for _, junk := range []string{"a.md", "x", ".json", "notes.txt"} {
		if err := writeFile(dir, junk, "x"); err != nil {
			t.Fatalf("write %s: %v", junk, err)
		}
	}

	got := cs.GetChats() // must not panic
	if len(got) != 1 || got[0].ChatID != "chatGood" {
		t.Errorf("expected only the real chat, got %+v", got)
	}
}

// The binding must carry modelId. The renderer drops any chat row whose modelId
// does not resolve to a known model, so a row persisted without one is invisible
// in the drawer, claims nothing, and its paid session is handed to the next
// unbound chat on that model — the exact theft the binding exists to prevent.
func TestUpdateChatSessionPersistsModelIdSoTheRowIsUsable(t *testing.T) {
	cs := NewChatStorage(t.TempDir())
	if err := cs.UpdateChatSession("chatV", "0xsessV", "0xmodelReal"); err != nil {
		t.Fatalf("bind: %v", err)
	}
	var row *struct{ ModelID, SessionID string }
	for _, c := range cs.GetChats() {
		if c.ChatID == "chatV" {
			row = &struct{ ModelID, SessionID string }{c.ModelID, c.SessionID}
		}
	}
	if row == nil {
		t.Fatal("chat missing from GetChats")
	}
	if row.ModelID != "0xmodelReal" {
		t.Errorf("ModelID = %q — the renderer will discard this row", row.ModelID)
	}
	if row.SessionID != "0xsessV" {
		t.Errorf("SessionID = %q", row.SessionID)
	}
}
