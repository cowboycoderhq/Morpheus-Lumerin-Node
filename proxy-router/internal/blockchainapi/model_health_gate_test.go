package blockchainapi

import (
	"strings"
	"testing"

	"github.com/MorpheusAIs/Morpheus-Lumerin-Node/proxy-router/internal/system"
	"github.com/ethereum/go-ethereum/common"
	"github.com/stretchr/testify/require"
)

func TestBlockingModelHealthStatus(t *testing.T) {
	modelID := common.HexToHash("0x01")
	otherID := common.HexToHash("0x02")

	tests := []struct {
		name    string
		reports []system.ModelHealthReport
		want    string
	}{
		{"no reports (pre-upgrade provider)", nil, ""},
		{"model not in report", []system.ModelHealthReport{{ModelID: otherID.Hex(), Status: system.ModelHealthStatusUnhealthy}}, ""},
		{"healthy", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusHealthy}}, ""},
		{"skipped (non-probeable type)", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusSkipped}}, ""},
		{"no_bid (stale self-report)", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusNoBid}}, ""},
		{"unhealthy", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusUnhealthy}}, system.ModelHealthStatusUnhealthy},
		{"tee_unverified", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusTeeUnverified}}, system.ModelHealthStatusTeeUnverified},
		{"no_model_configured", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusNoModel}}, system.ModelHealthStatusNoModel},
		{"case-insensitive model ID match", []system.ModelHealthReport{{ModelID: strings.ToUpper(modelID.Hex()), Status: system.ModelHealthStatusUnhealthy}}, system.ModelHealthStatusUnhealthy},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, blockingModelHealthStatus(tt.reports, modelID))
		})
	}
}

func TestClassifyModelHealth(t *testing.T) {
	modelID := common.HexToHash("0x01")
	otherID := common.HexToHash("0x02")

	tests := []struct {
		name       string
		reports    []system.ModelHealthReport
		wantClass  modelHealthClass
		wantStatus string
	}{
		{"no reports", nil, modelHealthUnknown, ""},
		{"model not in report", []system.ModelHealthReport{{ModelID: otherID.Hex(), Status: system.ModelHealthStatusHealthy}}, modelHealthUnknown, ""},
		{"healthy", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusHealthy}}, modelHealthHealthy, system.ModelHealthStatusHealthy},
		{"degraded", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusDegraded}}, modelHealthDegraded, system.ModelHealthStatusDegraded},
		{"skipped is unknown", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusSkipped}}, modelHealthUnknown, system.ModelHealthStatusSkipped},
		{"no_bid is unknown", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusNoBid}}, modelHealthUnknown, system.ModelHealthStatusNoBid},
		{"unhealthy is blocked", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusUnhealthy}}, modelHealthBlocked, system.ModelHealthStatusUnhealthy},
		{"tee_unverified is blocked", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusTeeUnverified}}, modelHealthBlocked, system.ModelHealthStatusTeeUnverified},
		{"no_model_configured is blocked", []system.ModelHealthReport{{ModelID: modelID.Hex(), Status: system.ModelHealthStatusNoModel}}, modelHealthBlocked, system.ModelHealthStatusNoModel},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			class, status := classifyModelHealth(tt.reports, modelID)
			require.Equal(t, tt.wantClass, class)
			require.Equal(t, tt.wantStatus, status)
		})
	}
}

func TestApplyHealthPolicy(t *testing.T) {
	tests := []struct {
		name         string
		policy       string
		classes      []modelHealthClass
		wantKeep     []bool
		wantFallback bool
	}{
		{
			"permissive keeps healthy, degraded and unknown",
			HealthPolicyPermissive,
			[]modelHealthClass{modelHealthHealthy, modelHealthDegraded, modelHealthUnknown, modelHealthBlocked, modelHealthUnreachable},
			[]bool{true, true, true, false, false},
			false,
		},
		{
			"strict keeps only healthy",
			HealthPolicyStrict,
			[]modelHealthClass{modelHealthHealthy, modelHealthDegraded, modelHealthUnknown, modelHealthBlocked, modelHealthUnreachable},
			[]bool{true, false, false, false, false},
			false,
		},
		{
			"preferred skips unknown when a healthy peer exists",
			HealthPolicyPreferred,
			[]modelHealthClass{modelHealthHealthy, modelHealthUnknown, modelHealthBlocked},
			[]bool{true, false, false},
			false,
		},
		{
			"preferred treats degraded as serviceable",
			HealthPolicyPreferred,
			[]modelHealthClass{modelHealthDegraded, modelHealthUnknown},
			[]bool{true, false},
			false,
		},
		{
			"preferred falls back to permissive when no peer reports healthy or degraded",
			HealthPolicyPreferred,
			[]modelHealthClass{modelHealthUnknown, modelHealthBlocked, modelHealthUnreachable},
			[]bool{true, false, false},
			true,
		},
		{
			"strict with no healthy peers keeps nothing",
			HealthPolicyStrict,
			[]modelHealthClass{modelHealthUnknown, modelHealthDegraded},
			[]bool{false, false},
			false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			keep, fallback := applyHealthPolicy(tt.policy, tt.classes)
			require.Equal(t, tt.wantKeep, keep)
			require.Equal(t, tt.wantFallback, fallback)
		})
	}
}
