package structs

import (
	"github.com/MorpheusAIs/Morpheus-Lumerin-Node/proxy-router/internal/lib"
	"github.com/ethereum/go-ethereum/common"
)

type AllowanceRes struct {
	Allowance *lib.BigInt `json:"allowance" example:"100000000" swaggertype:"integer"`
}

type TxRes struct {
	Tx common.Hash `json:"tx" example:"0x1234"`
}

type ErrRes struct {
	Error string `json:"error" example:"error message"`
}

type OpenSessionRes struct {
	SessionID common.Hash `json:"sessionID" example:"0x1234"`
}

type BalanceRes struct {
	Balance *lib.BigInt `json:"balance" swaggertype:"string"`
}

type ProviderRes struct {
	Provider *Provider `json:"provider"`
}

type ProvidersRes struct {
	Providers []*Provider `json:"providers"`
}

type BidRes struct {
	Bid *Bid `json:"bid"`
}

type BidsRes struct {
	Bids []*Bid `json:"bids"`
}

type ScoredBidsRes struct {
	Bids []ScoredBid `json:"bids"`
}

type ModelRes struct {
	Model *Model `json:"model"`
}

type ModelsRes struct {
	Models []*Model `json:"models"`
}

type TokenBalanceRes struct {
	MOR *lib.BigInt `json:"mor" example:"100000000" swaggertype:"integer"`
	ETH *lib.BigInt `json:"eth" example:"100000000" swaggertype:"integer"`
}

type StakesOnHoldRes struct {
	// Available is the releasable (past releaseAt) user stake in the diamond.
	Available *lib.BigInt `json:"available" example:"100000000" swaggertype:"integer"`
	// Hold is the user stake still time-locked until its release day.
	Hold *lib.BigInt `json:"hold" example:"100000000" swaggertype:"integer"`
}

type DelegatedPoolRes struct {
	// AvailableToStake is what the router's wallet can stake from its delegated
	// pool right now. Matured day-locks count as available: the contract
	// recycles them automatically on the next pool draw.
	AvailableToStake *lib.BigInt `json:"availableToStake" example:"100000000" swaggertype:"integer"`
	// FreeBalance is pool MOR not locked in sessions or day-locks.
	FreeBalance *lib.BigInt `json:"freeBalance" example:"100000000" swaggertype:"integer"`
	// LockedBalance is pool MOR locked in open sessions or maturing day-locks.
	LockedBalance *lib.BigInt `json:"lockedBalance" example:"100000000" swaggertype:"integer"`
	// PendingWithdrawalsTotal is funder withdrawal volume queued for service.
	PendingWithdrawalsTotal *lib.BigInt `json:"pendingWithdrawalsTotal" example:"0" swaggertype:"integer"`
	// FunderCount is the number of cold wallets with an active grant.
	FunderCount *lib.BigInt `json:"funderCount" example:"5" swaggertype:"integer"`
	// HoldCount is the number of day-lock buckets not yet recycled.
	HoldCount *lib.BigInt `json:"holdCount" example:"1" swaggertype:"integer"`
}

type TransactionsRes struct {
	Transactions []MappedTransaction `json:"transactions"`
}

type SessionRes struct {
	Session *Session `json:"session"`
}

type SessionsRes struct {
	Sessions []*Session `json:"sessions"`
}

type BudgetRes struct {
	Budget *lib.BigInt `json:"budget" example:"100000000" swaggertype:"integer"`
}

type SupplyRes struct {
	Supply *lib.BigInt `json:"supply" example:"100000000" swaggertype:"integer"`
}

type BlockRes struct {
	Block uint64 `json:"block" example:"1234"`
}

// OpenSessionStakeEstimate is the MOR amount and inputs used when opening a session
// with the top-scored bid (same ordering as GetRatedBids / first OpenSession attempt).
type OpenSessionStakeEstimate struct {
	StakeWei           string  `json:"stake_wei"`
	SessionCostWei     string  `json:"session_cost_wei"`
	MorSupplyWei       string  `json:"mor_supply_wei"`
	EmissionsBudgetWei string  `json:"emissions_budget_wei"`
	PricePerSecondWei  string  `json:"price_per_second_wei"`
	DurationSeconds    string  `json:"duration_seconds"`
	DirectPayment      bool    `json:"direct_payment"`
	TopBidProvider     string  `json:"top_bid_provider"`
	TopBidScore        float64 `json:"top_bid_score"`
	Explanation        string  `json:"explanation"`
}
