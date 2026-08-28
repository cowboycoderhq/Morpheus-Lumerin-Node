package main

import (
	"flag"
	"testing"

	"github.com/MorpheusAIs/Morpheus-Lumerin-Node/cli/chat/client"
	"github.com/urfave/cli/v2"
)

// Covers the three CLI pagination-flag validation defects fixed alongside
// commit 5c4e3dc2 (--offset/--limit/--order on listBlockchainSession), plus
// the docs-accuracy branch's follow-up fixes to the same three flags:
//   - limitToUint8 must reject a --limit above the server's uint8 ceiling
//     instead of silently wrapping mod 256 (256 -> 0, 300 -> 44 on the wire),
//     and must reject 0: the server's contract is validate:"gte=1", limit=0
//     returns an empty page, and 0 used to sail through and get misreported
//     as "a full page of results was returned" (main.go's full-page note).
//   - validateOffset must reject a negative --offset; the server's
//     validate:"gte=0" tag (structs/req.go) is a go-playground/validator tag
//     that gin's ShouldBindQuery does not enforce. It must be applied at
//     both call sites (listBlockchainSessions and blockchainProvidersBids)
//     -- only the former had it.
//   - orderToServerString must accept both documented --order values
//     case-insensitively and translate them to the exact string
//     proxy-router's mapOrder (internal/blockchainapi/mappers.go) requires --
//     "ASC" is the only string that mapper treats as ascending.
//   - resolveOrder must omit the order parameter (return "") when --order
//     was not explicitly passed, preserving the pre-pagination CLI's bare-
//     invocation behaviour per the operator's decision, while still
//     delegating to orderToServerString when --order was passed explicitly.

func TestLimitToUint8(t *testing.T) {
	cases := []struct {
		name    string
		limit   uint
		want    uint8
		wantErr bool
	}{
		{name: "zero is rejected: the server returns an empty page for it, which would be misreported as a full page", limit: 0, wantErr: true},
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

// TestResolveOrder covers defect 1 from the docs-accuracy PR: the operator
// decided a bare `listBlockchainSession` (no --order flag) must return
// exactly what it returned before pagination was added to this command,
// while --order asc and --order desc must both still work as their names
// say. resolveOrder is the mechanism chosen for that: it omits the order
// parameter (returns "") when the flag was never explicitly set, instead of
// hard-coding a literal default order value -- see the doc comment on
// resolveOrder in main.go for why. See also TestListSessionsOrderQueryString
// in cli/chat/client/client_test.go, which asserts the resulting query
// string at the wire level.
func TestResolveOrder(t *testing.T) {
	cases := []struct {
		name    string
		isSet   bool
		value   string
		want    string
		wantErr bool
	}{
		{name: "--order not passed: omit the parameter, preserving the pre-pagination default order", isSet: false, value: "asc", want: ""},
		{name: "--order asc, explicitly passed", isSet: true, value: "asc", want: "ASC"},
		{name: "--order desc, explicitly passed", isSet: true, value: "desc", want: "DESC"},
		{name: "--order bogus, explicitly passed", isSet: true, value: "bogus", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := resolveOrder(tc.isSet, tc.value)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("resolveOrder(%v, %q) = %q, <nil>; want an error", tc.isSet, tc.value, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("resolveOrder(%v, %q) returned unexpected error: %v", tc.isSet, tc.value, err)
			}
			if got != tc.want {
				t.Fatalf("resolveOrder(%v, %q) = %q; want %q", tc.isSet, tc.value, got, tc.want)
			}
		})
	}
}

// TestBlockchainProvidersBidsRejectsNegativeOffset covers defect 2 from the
// docs-accuracy PR: validateOffset was applied in listBlockchainSessions but
// not in blockchainProvidersBids, so --offset -1 sailed through to
// big.NewInt and on to the server, which dies with "abi: negatively-signed
// value cannot be packed into uint parameter" instead of a clear CLI error.
//
// The client points at 127.0.0.1:1 -- nothing listens there. If validation
// is skipped and the request reaches the network, this test fails on a
// connection error rather than silently passing, so a green run also proves
// the check runs *before* any request is built, not just that it exists.
func TestBlockchainProvidersBidsRejectsNegativeOffset(t *testing.T) {
	c := client.NewApiGatewayClient("http://127.0.0.1:1", nil)
	a := NewActions(c)

	set := flag.NewFlagSet("test", flag.ContinueOnError)
	set.String("address", "0xabc", "")
	set.Int64("offset", -1, "")
	set.Uint("limit", 10, "")
	cCtx := cli.NewContext(nil, set, nil)

	err := a.blockchainProvidersBids(cCtx)
	if err == nil {
		t.Fatal("blockchainProvidersBids(--offset -1) = <nil>; want a validation error")
	}

	want := "--offset -1 must not be negative"
	if err.Error() != want {
		t.Fatalf("blockchainProvidersBids(--offset -1) error = %q; want %q (did it reach the network instead of validating first?)", err.Error(), want)
	}
}
