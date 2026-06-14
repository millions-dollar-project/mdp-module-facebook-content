package handlers

import (
	"testing"
	"time"
)

// TestParseUntilDate_YYYY_MM_DD_LocalVN verifies that picking
// "2026-06-12" in Asia/Ho_Chi_Minh (UTC+7) returns the *exclusive*
// end of that local day, so all posts on the chosen calendar day
// are kept by `t.After(*until)` filter.
//
// This is the bug that bit users on 12/06/2026: parseUntilDate used
// to call time.Parse(...) which interprets YYYY-MM-DD as UTC, so a
// post at 01:00 local (= 18:00Z the day before) was dropped.
func TestParseUntilDate_YYYY_MM_DD_LocalVN(t *testing.T) {
	t.Setenv("TZ", "Asia/Ho_Chi_Minh")
	setLocalTZ(t, "Asia/Ho_Chi_Minh")

	got, err := parseUntilDate("2026-06-12")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	// Expected: 2026-06-13 00:00 +07:00 = 2026-06-12 17:00:00 UTC.
	want := time.Date(2026, 6, 13, 0, 0, 0, 0, time.FixedZone("ICT", 7*3600))
	if !got.Equal(want) {
		t.Fatalf("want %s, got %s", want, got)
	}
	// And the post that used to get dropped (1h local on 12/06) is now kept.
	postLocalMorning := time.Date(2026, 6, 12, 1, 0, 0, 0, time.FixedZone("ICT", 7*3600))
	if !postLocalMorning.Before(got) {
		t.Fatalf("post at 01:00 ICT on cutoff day must be < until; got %s vs %s", postLocalMorning, got)
	}
	// Post at 23:59 on cutoff day is also kept.
	postLocalLateNight := time.Date(2026, 6, 12, 23, 59, 59, 0, time.FixedZone("ICT", 7*3600))
	if !postLocalLateNight.Before(got) {
		t.Fatalf("post at 23:59 ICT on cutoff day must be < until; got %s vs %s", postLocalLateNight, got)
	}
	// Post at 00:00 the next local day is dropped.
	postNextDayMorning := time.Date(2026, 6, 13, 0, 0, 0, 0, time.FixedZone("ICT", 7*3600))
	if !postNextDayMorning.After(got) && !postNextDayMorning.Equal(got) {
		t.Fatalf("post at 00:00 ICT next day must be >= until; got %s vs %s", postNextDayMorning, got)
	}
}

// TestParseUntilDate_YYYY_MM_DD_UTC verifies the same input in UTC
// returns the exclusive end of *that* day in UTC — i.e. the parse
// honors the host's local timezone, not a hard-coded UTC.
func TestParseUntilDate_YYYY_MM_DD_UTC(t *testing.T) {
	setLocalTZ(t, "UTC")

	got, err := parseUntilDate("2026-06-12")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	// 2026-06-13 00:00:00 UTC.
	want := time.Date(2026, 6, 13, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("want %s, got %s", want, got)
	}
}

// TestParseUntilDate_DD_MM_YYYY_LocalVN verifies the UI's Vietnamese
// date format. "06/12/2026" must mean 6 December 2026, not June 12.
func TestParseUntilDate_DD_MM_YYYY_LocalVN(t *testing.T) {
	setLocalTZ(t, "Asia/Ho_Chi_Minh")

	got, err := parseUntilDate("06/12/2026")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	want := time.Date(2026, 12, 7, 0, 0, 0, 0, time.FixedZone("ICT", 7*3600))
	if !got.Equal(want) {
		t.Fatalf("want %s, got %s", want, got)
	}
}

// TestParseUntilDate_RFC3339_PreservesOffset verifies RFC3339 inputs
// keep their explicit offset and are not reinterpreted as local.
func TestParseUntilDate_RFC3339_PreservesOffset(t *testing.T) {
	setLocalTZ(t, "Asia/Ho_Chi_Minh")

	got, err := parseUntilDate("2026-06-12T10:00:00Z")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	// RFC3339 with Z → UTC, returned as-is.
	want := time.Date(2026, 6, 12, 10, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("want %s, got %s", want, got)
	}

	// RFC3339 with +07:00 offset.
	got2, err := parseUntilDate("2026-06-12T10:00:00+07:00")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	want2 := time.Date(2026, 6, 12, 10, 0, 0, 0, time.FixedZone("ICT", 7*3600))
	if !got2.Equal(want2) {
		t.Fatalf("want %s, got %s", want2, got2)
	}
}

// TestParseUntilDate_BadInput verifies the function rejects garbage.
func TestParseUntilDate_BadInput(t *testing.T) {
	if _, err := parseUntilDate("not a date"); err == nil {
		t.Fatalf("expected error for invalid date")
	}
	if _, err := parseUntilDate("2026/06/12"); err == nil {
		t.Fatalf("expected error for YYYY/MM/DD format")
	}
}

// setLocalTZ overrides time.Local for the duration of the test using
// t.Setenv TZ. On Unix, Go's time package reads TZ on the first
// reference to time.Local, which is a sync.Once. So we have to
// pre-load the zone before the SUT touches time.Local — easier to
// just construct a fixed zone and rely on parseUntilDate's call
// to time.ParseInLocation with an explicit zone being independent
// of time.Local? No, the production parseUntilDate uses time.Local.
//
// Workaround: set the env, then force a load via time.LoadLocation +
// time.FixedZone replacement via a side-effect call.
func setLocalTZ(t *testing.T, tz string) {
	t.Helper()
	t.Setenv("TZ", tz)
	// Reset the time.Local cache by loading the zone and assigning.
	loc, err := time.LoadLocation(tz)
	if err != nil {
		t.Fatalf("LoadLocation(%q): %v", tz, err)
	}
	time.Local = loc
}
