package blockchainapi

import (
	"context"
	"errors"
	"math/big"
	"time"

	"github.com/MorpheusAIs/Morpheus-Lumerin-Node/proxy-router/internal/lib"
)

// StakeClaimer sweeps MOR that any close landing before releaseAt time-locked,
// back to the user, as soon as it matures.
//
// Why this exists: closing a session does not spend the stake, it pushes
// OnHold(amount, startOfTheDay(min(closedAt, endsAt))+1day) onto the user's list
// (SessionRouter._rewardUserAfterClose, :296-298). The Diamond exposes
// getUserStakesOnHold/withdrawUserStakes, but nothing ever called them — no
// endpoint, no UI — so the money was invisible AND unreachable. A real user
// closed a 6-minute session at 3 minutes and watched ~2.7 MOR vanish for a day
// with no way to get it back (2026-07-16). The lock is enforced on-chain and
// cannot be shortened; the only thing software can fix is the *reaching* of it.
//
// Safety: withdrawUserStakes(user_, ...) transfers to `user_` and nowhere else,
// and we only ever pass our own address, so this job cannot send funds anywhere
// but home. Its blast radius is gas. It never claims a stake that has not
// matured — the contract would skip the entry and we would pay a fee for a
// transfer of zero.
type StakeClaimer struct {
	blockchainService *BlockchainService
	interval          time.Duration
	log               lib.ILogger
}

// claimInterval: the lock releases on a 1-day boundary, so nothing is gained by
// polling hard — but a user who reopens the app expecting their MOR back should
// not wait long. Ten minutes costs two cheap eth_calls an hour and bounds the
// "why isn't it back yet" window.
const claimInterval = 10 * time.Minute

func NewStakeClaimer(blockchainService *BlockchainService, log lib.ILogger) *StakeClaimer {
	return &StakeClaimer{
		blockchainService: blockchainService,
		interval:          claimInterval,
		log:               log.Named("STAKE_CLAIMER"),
	}
}

// claimOnce withdraws matured stake if there is any. Returns the amount swept.
func (s *StakeClaimer) claimOnce(ctx context.Context) *big.Int {
	available, hold, err := s.blockchainService.GetUserStakesOnHold(ctx)
	if err != nil {
		// Transient RPC trouble is expected on a laptop that sleeps; say so at
		// warn and try again next tick rather than killing the loop.
		s.log.Warnf("cannot read stakes on hold: %s", err)
		return nil
	}

	if available == nil || available.Sign() == 0 {
		if hold != nil && hold.Sign() > 0 {
			// Common after any close landing before releaseAt, not only an early one:
			// money exists but is not due yet. Log it so "where is my MOR" has an answer.
			s.log.Infof("%s wei of stake still time-locked from session closes that landed before releaseAt - any close, not only an early one; nothing matured yet", hold.String())
		}
		return nil
	}

	s.log.Infof("claiming %s wei of matured stake", available.String())
	txHash, claimed, err := s.blockchainService.WithdrawUserStakes(ctx)
	if err != nil {
		if errors.Is(err, ErrNothingToWithdraw) {
			// Raced with another claim, or it matured away between the read and
			// the write. Not an error.
			return nil
		}
		s.log.Warnf("failed to claim matured stake: %s", err)
		return nil
	}

	s.log.Infof("claimed %s wei back to wallet, tx %s", claimed.String(), txHash.Hex())
	return claimed
}

// Run claims matured stake on start and then on a ticker. It never returns an
// error for a failed claim — a wallet that cannot reach the chain right now is
// not a reason to take the proxy down, and the next tick retries.
func (s *StakeClaimer) Run(ctx context.Context) error {
	s.log.Info("Stake auto-claim started")
	s.claimOnce(ctx)

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			s.claimOnce(ctx)
		}
	}
}
