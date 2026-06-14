// Package secure provides transparent encryption for sensitive fields stored
// in PostgreSQL. When ENCRYPTION_KEY is empty the package is a no-op
// (passthrough) so dev environments keep working without a key.
package secure

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"strings"
)

// Box holds an AES-GCM cipher ready for Encrypt/Decrypt. A nil Box is a
// no-op safe to use directly (Encrypt/Decrypt return plaintext unchanged).
type Box struct {
	gcm cipher.AEAD
}

// NewBox builds a Box from a hex-encoded 32-byte key. If keyHex is empty
// or malformed a no-op Box is returned so the caller never has to check nil.
func NewBox(keyHex string) *Box {
	if keyHex == "" {
		return &Box{}
	}
	key, err := hex.DecodeString(keyHex)
	if err != nil || len(key) != 32 {
		return &Box{}
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return &Box{}
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return &Box{}
	}
	return &Box{gcm: gcm}
}

// Encrypt returns base64(nonce||ciphertext). If the Box is no-op it returns
// plaintext unchanged.
func (b *Box) Encrypt(plaintext string) string {
	if b.gcm == nil || plaintext == "" {
		return plaintext
	}
	nonce := make([]byte, b.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return plaintext
	}
	out := b.gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(out)
}

// Decrypt reverses Encrypt. If the Box is no-op it returns ciphertext
// unchanged. If ciphertext is not a valid base64 string it returns an error.
func (b *Box) Decrypt(ciphertext string) (string, error) {
	if b.gcm == nil || ciphertext == "" {
		return ciphertext, nil
	}
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		// If it's not base64 it might be unencrypted plaintext (first boot
		// before encryption was enabled). Return as-is without error so the
		// migration is graceful.
		return ciphertext, nil
	}
	if len(data) < b.gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, sealed := data[:b.gcm.NonceSize()], data[b.gcm.NonceSize():]
	plain, err := b.gcm.Open(nil, nonce, sealed, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// MustDecrypt is like Decrypt but panics on error. Useful for tests where
// the ciphertext is known-good.
func (b *Box) MustDecrypt(ciphertext string) string {
	out, err := b.Decrypt(ciphertext)
	if err != nil {
		panic(err)
	}
	return out
}

// Redact returns a shortened safe-to-log representation of a secret string.
func Redact(s string) string {
	if len(s) <= 8 {
		return "***"
	}
	return s[:4] + "…" + s[len(s)-4:]
}

// IsEncrypted returns true if s looks like a base64 string produced by
// Encrypt. It is a heuristic used to decide whether to decrypt or pass
// through during a migration window.
func IsEncrypted(s string) bool {
	if s == "" {
		return false
	}
	_, err := base64.StdEncoding.DecodeString(s)
	return err == nil && strings.Contains(s, "=") == false
}
