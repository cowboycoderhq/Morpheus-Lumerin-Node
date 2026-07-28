package registries

import (
	"context"
	"math/big"

	i "github.com/MorpheusAIs/Morpheus-Lumerin-Node/proxy-router/internal/interfaces"
	"github.com/MorpheusAIs/Morpheus-Lumerin-Node/proxy-router/internal/lib"
	ds "github.com/MorpheusAIs/Morpheus-Lumerin-Node/proxy-router/internal/repositories/contracts/bindings/delegatestaking"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
)

// DelegateStaking wraps the DelegateStaking diamond facet: the delegated
// consumer staking pool that cold wallets fund so a hot consumer-node wallet
// can stake sessions without holding MOR itself (RFP §3.5.1).
type DelegateStaking struct {
	delegateStakingAddr common.Address

	client          i.ContractBackend
	delegateStaking *ds.DelegateStaking
	log             lib.ILogger
}

func NewDelegateStaking(delegateStakingAddr common.Address, client i.ContractBackend, log lib.ILogger) *DelegateStaking {
	staking, err := ds.NewDelegateStaking(delegateStakingAddr, client)
	if err != nil {
		panic("invalid delegate staking ABI: " + err.Error())
	}

	return &DelegateStaking{
		delegateStaking:     staking,
		delegateStakingAddr: delegateStakingAddr,
		client:              client,
		log:                 log,
	}
}

// GetAvailableToStake returns the amount the hot wallet can stake from its
// delegated pool right now. Matured day-locks are counted as available: the
// contract recycles them automatically on the next pool draw.
func (g *DelegateStaking) GetAvailableToStake(ctx context.Context, hot common.Address) (*big.Int, error) {
	available, err := g.delegateStaking.GetAvailableToStake(&bind.CallOpts{Context: ctx}, hot)
	if err != nil {
		return nil, lib.TryConvertGethError(err)
	}
	return available, nil
}

// GetStakingPool returns the aggregate pool state for a hot wallet.
func (g *DelegateStaking) GetStakingPool(ctx context.Context, hot common.Address) (freeBalance, lockedBalance, pendingTotal, funderCount, holdCount *big.Int, err error) {
	res, err := g.delegateStaking.GetStakingPool(&bind.CallOpts{Context: ctx}, hot)
	if err != nil {
		return nil, nil, nil, nil, nil, lib.TryConvertGethError(err)
	}
	return res.FreeBalance, res.LockedBalance, res.PendingTotal, res.FunderCount, res.HoldCount, nil
}
