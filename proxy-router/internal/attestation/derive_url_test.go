package attestation

import "testing"

func TestDeriveAttestationURL_Phase1Port(t *testing.T) {
	got, err := DeriveAttestationURL("https://provider.example.com:3333/v1")
	if err != nil {
		t.Fatal(err)
	}
	want := "https://provider.example.com:29343"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestDeriveBackendAttestationURL_Phase2Port(t *testing.T) {
	got, err := DeriveBackendAttestationURL("https://secretai-rytn.scrtlabs.com:21434/v1")
	if err != nil {
		t.Fatal(err)
	}
	want := "https://secretai-rytn.scrtlabs.com:21434"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
