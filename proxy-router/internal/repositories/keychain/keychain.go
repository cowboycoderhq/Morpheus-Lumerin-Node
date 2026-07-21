package keychain

import (
	"errors"
	"strings"

	"github.com/zalando/go-keyring"
)

const SERVICE_NAME = "morpheus-proxy-router"

var ErrKeyNotFound = keyring.ErrNotFound

type Keychain struct {
	service string
}

func NewKeychain() *Keychain {
	return &Keychain{}
}

func (k *Keychain) Get(key string) (string, error) {
	return keyring.Get(SERVICE_NAME, key)
}

func (k *Keychain) Insert(key string, value string) error {
	return keyring.Set(SERVICE_NAME, key, value)
}

func (k *Keychain) Upsert(key string, value string) error {
	return keyring.Set(SERVICE_NAME, key, value)
}

func (k *Keychain) Delete(key string) error {
	return keyring.Delete(SERVICE_NAME, key)
}

func (k *Keychain) DeleteIfExists(key string) error {
	err := k.Delete(key)
	if err == nil || errors.Is(err, keyring.ErrNotFound) {
		return nil
	}
	// Windows Credential Manager / wincred sometimes surfaces "not found" as a
	// plain error string rather than keyring.ErrNotFound. Treat those as success
	// so SetMnemonic/SetPrivateKey are not blocked during onboarding (#811).
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "not found") ||
		strings.Contains(msg, "cannot find") ||
		strings.Contains(msg, "element not found") {
		return nil
	}
	return err
}
