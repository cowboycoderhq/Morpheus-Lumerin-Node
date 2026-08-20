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
