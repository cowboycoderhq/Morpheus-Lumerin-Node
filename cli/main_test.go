package main

import "testing"

// Covers the three CLI pagination-flag validation defects fixed alongside
// commit 5c4e3dc2 (--offset/--limit/--order on listBlockchainSession):
//   - limitToUint8 must reject a --limit above the server's uint8 ceiling
//     instead of silently wrapping mod 256 (256 -> 0, 300 -> 44 on the wire).
//   - validateOffset must reject a negative --offset; the server's
//     validate:"gte=0" tag (structs/req.go) is a go-playground/validator tag
//     that gin's ShouldBindQuery does not enforce.
//   - orderToServerString must accept both documented --order values
//     case-insensitively and translate them to the exact string
//     proxy-router's mapOrder (internal/blockchainapi/mappers.go) requires --
//     "ASC" is the only string that mapper treats as ascending.

func TestLimitToUint8(t *testing.T) {
	cases := []struct {
		name    string
		limit   uint
		want    uint8
		wantErr bool
	}{
		{name: "zero is a legal limit", limit: 0, want: 0},
		{name: "largest accepted limit (uint8 max)", limit: 255, want: 255},
		{name: "first rejected value", limit: 256, wantErr: true},
		{name: "observed bug: 300 must not silently become 44", limit: 300, wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := limitToUint8(tc.limit)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("limitToUint8(%d) = %d, <nil>; want an error", tc.limit, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("limitToUint8(%d) returned unexpected error: %v", tc.limit, err)
			}
			if got != tc.want {
				t.Fatalf("limitToUint8(%d) = %d; want %d", tc.limit, got, tc.want)
			}
		})
	}
}

func TestValidateOffset(t *testing.T) {
	cases := []struct {
		name    string
		offset  int64
		wantErr bool
	}{
		{name: "zero is valid", offset: 0},
		{name: "positive is valid", offset: 42},
		{name: "negative is rejected", offset: -1, wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateOffset(tc.offset)
			if tc.wantErr && err == nil {
				t.Fatalf("validateOffset(%d) = <nil>; want an error", tc.offset)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("validateOffset(%d) returned unexpected error: %v", tc.offset, err)
			}
		})
	}
}

func TestOrderToServerString(t *testing.T) {
	cases := []struct {
		name    string
		order   string
		want    string
		wantErr bool
	}{
		{name: "documented value: asc", order: "asc", want: "ASC"},
		{name: "documented value: desc", order: "desc", want: "DESC"},
		{name: "case-insensitive: ASC", order: "ASC", want: "ASC"},
		{name: "case-insensitive: Desc", order: "Desc", want: "DESC"},
		{name: "undocumented value is rejected", order: "bogus", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := orderToServerString(tc.order)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("orderToServerString(%q) = %q, <nil>; want an error", tc.order, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("orderToServerString(%q) returned unexpected error: %v", tc.order, err)
			}
			if got != tc.want {
				t.Fatalf("orderToServerString(%q) = %q; want %q", tc.order, got, tc.want)
			}
		})
	}
}
