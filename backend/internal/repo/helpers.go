// Package-private helpers for converting between sqlc-generated row
// types and the domain models. Keeps the rest of the repo free of
// pgtype.* noise.
package repo

import (
	"encoding/json"
	"errors"
	"math/big"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// ErrDuplicate is returned when a UNIQUE constraint blocks an insert.
// Callers should map to HTTP 409.
var ErrDuplicate = errors.New("duplicate")

// uuidToString renders a uuid as the canonical 36-char string. The sqlc
// generated code uses pgtype.UUID everywhere; we want plain strings in
// the domain layer.
func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return uuidFromBytes(u.Bytes)
}

func uuidFromBytes(b [16]byte) string {
	// 8-4-4-4-12 hex
	dst := make([]byte, 36)
	hex := []byte("0123456789abcdef")
	idx := 0
	for i, by := range b {
		dst[idx] = hex[by>>4]
		dst[idx+1] = hex[by&0x0f]
		idx += 2
		if i == 3 || i == 5 || i == 7 || i == 9 {
			dst[idx] = '-'
			idx++
		}
	}
	return string(dst)
}

// stringToUUID parses a canonical UUID into pgtype.UUID. Returns
// invalid if the input is not 36 chars or malformed.
func stringToUUID(s string) pgtype.UUID {
	if len(s) != 36 {
		return pgtype.UUID{}
	}
	var b [16]byte
	pos := 0
	for i := 0; i < 36; i++ {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if s[i] != '-' {
				return pgtype.UUID{}
			}
			continue
		}
		hi := hexNibble(s[i])
		lo := hexNibble(s[i+1])
		if hi == 0xff || lo == 0xff {
			return pgtype.UUID{}
		}
		b[pos] = (hi << 4) | lo
		pos++
		i++
	}
	return pgtype.UUID{Bytes: b, Valid: true}
}

// stringPtrToUUID is the nullable counterpart to stringToUUID. A nil
// pointer maps to an invalid pgtype.UUID (NULL in the DB).
func stringPtrToUUID(s *string) pgtype.UUID {
	if s == nil {
		return pgtype.UUID{}
	}
	return stringToUUID(*s)
}

func hexNibble(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10
	default:
		return 0xff
	}
}

// pgTimeToTime extracts the underlying time.Time from a pgtype.Timestamptz.
// Returns the zero time when the value is invalid (NULL).
func pgTimeToTime(t pgtype.Timestamptz) time.Time {
	if !t.Valid {
		return time.Time{}
	}
	return t.Time
}

// timeToPgTime wraps a domain time.Time for sqlc. Treats the zero time
// as invalid (NULL).
func timeToPgTime(t time.Time) pgtype.Timestamptz {
	if t.IsZero() {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t, Valid: true}
}

// timePtrToPgTime wraps a *time.Time. nil → invalid (NULL); non-nil
// zero time → also invalid (cleaner than storing a zero timestamp).
func timePtrToPgTime(t *time.Time) pgtype.Timestamptz {
	if t == nil || t.IsZero() {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *t, Valid: true}
}

// float64ToNumeric wraps a *float64 as a pgtype.Numeric so it can be
// passed to a sqlc-generated Insert/Update struct. Returns invalid
// when the pointer is nil (NULL in the DB).
func float64ToNumeric(p *float64) pgtype.Numeric {
	if p == nil {
		return pgtype.Numeric{}
	}
	return numericFromFloat(*p)
}

// numericFromFloat encodes a float64 as a pgtype.Numeric by routing
// through its string form, which the codec accepts directly.
func numericFromFloat(f float64) pgtype.Numeric {
	if f == 0 {
		return pgtype.Numeric{Int: big.NewInt(0), Valid: true}
	}
	// 17 significant digits preserves any float64 round-trip.
	s := strconv.FormatFloat(f, 'f', -1, 64)
	var n pgtype.Numeric
	if err := n.Scan(s); err != nil {
		return pgtype.Numeric{}
	}
	return n
}

// numericToFloat64 reads a pgtype.Numeric back as *float64.
func numericToFloat64(n pgtype.Numeric) *float64 {
	if !n.Valid {
		return nil
	}
	f8, err := n.Float64Value()
	if err != nil || !f8.Valid {
		return nil
	}
	v := f8.Float64
	return &v
}

// stringSliceToBytes marshals a []string to JSON bytes for sqlc jsonb params.
func stringSliceToBytes(s []string) []byte {
	if len(s) == 0 {
		return []byte("[]")
	}
	b, _ := json.Marshal(s)
	return b
}

// bytesToStringSlice unmarshals JSON bytes back to []string.
func bytesToStringSlice(b []byte) []string {
	if len(b) == 0 {
		return nil
	}
	var s []string
	_ = json.Unmarshal(b, &s)
	return s
}
