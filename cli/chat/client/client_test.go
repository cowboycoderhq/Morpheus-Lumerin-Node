package client

import (
	"context"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestListSessionsOrderQueryString covers defect 1 from the docs-accuracy
// PR. The pre-pagination CLI sent no order parameter at all for
// `listBlockchainSession`, letting the server apply its own default; the
// server's own default is the lowercase "asc" (structs/req.go's
// `form:"order,default=asc"`), which proxy-router's mapOrder does not treat
// as ascending (mappers.go:105-110 only matches the exact string "ASC"), so
// "no order parameter" has always meant effectively-descending,
// newest-first results. The operator decided a bare `listBlockchainSession`
// must keep returning exactly that.
//
// offset and limit are new pagination functionality introduced alongside
// --order in the same PR and are always sent regardless of --order; only
// the order component's absence for a bare invocation is being restored
// here. See resolveOrder in cli/main.go for the flag-level half of this fix
// (it decides whether "" or a resolved "ASC"/"DESC" reaches these methods).
func TestListSessionsOrderQueryString(t *testing.T) {
	cases := []struct {
		name      string
		order     string
		wantQuery string
	}{
		{
			name:      "no --order flag: omit the parameter, so the server applies the default the pre-pagination CLI relied on",
			order:     "",
			wantQuery: "user=0xabc&offset=0&limit=10",
		},
		{
			name:      "--order asc",
			order:     "ASC",
			wantQuery: "user=0xabc&offset=0&limit=10&order=ASC",
		},
		{
			name:      "--order desc",
			order:     "DESC",
			wantQuery: "user=0xabc&offset=0&limit=10&order=DESC",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var gotQuery string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotQuery = r.URL.RawQuery
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string][]SessionListItem{"sessions": {}})
			}))
			defer srv.Close()

			c := NewApiGatewayClient(srv.URL, nil)
			if _, err := c.ListUserSessions(context.Background(), "0xabc", big.NewInt(0), 10, tc.order); err != nil {
				t.Fatalf("ListUserSessions: unexpected error: %v", err)
			}

			if gotQuery != tc.wantQuery {
				t.Fatalf("query string = %q; want %q", gotQuery, tc.wantQuery)
			}
		})
	}
}

// TestListProviderSessionsOrderQueryString mirrors
// TestListSessionsOrderQueryString for ListProviderSessions, which shares
// the same order-omission logic.
func TestListProviderSessionsOrderQueryString(t *testing.T) {
	cases := []struct {
		name      string
		order     string
		wantQuery string
	}{
		{
			name:      "no --order flag: omit the parameter, so the server applies the default the pre-pagination CLI relied on",
			order:     "",
			wantQuery: "provider=0xdef&offset=0&limit=10",
		},
		{
			name:      "--order asc",
			order:     "ASC",
			wantQuery: "provider=0xdef&offset=0&limit=10&order=ASC",
		},
		{
			name:      "--order desc",
			order:     "DESC",
			wantQuery: "provider=0xdef&offset=0&limit=10&order=DESC",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var gotQuery string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotQuery = r.URL.RawQuery
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string][]SessionListItem{"sessions": {}})
			}))
			defer srv.Close()

			c := NewApiGatewayClient(srv.URL, nil)
			if _, err := c.ListProviderSessions(context.Background(), "0xdef", big.NewInt(0), 10, tc.order); err != nil {
				t.Fatalf("ListProviderSessions: unexpected error: %v", err)
			}

			if gotQuery != tc.wantQuery {
				t.Fatalf("query string = %q; want %q", gotQuery, tc.wantQuery)
			}
		})
	}
}
