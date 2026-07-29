// Code generated - DO NOT EDIT.
// This file is a generated binding and any manual changes will be lost.

package delegatestaking

import (
	"errors"
	"math/big"
	"strings"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/event"
)

// Reference imports to suppress errors if they are not otherwise used.
var (
	_ = errors.New
	_ = big.NewInt
	_ = strings.NewReader
	_ = ethereum.NotFound
	_ = bind.Bind
	_ = common.Big1
	_ = types.BloomLookup
	_ = event.NewSubscription
	_ = abi.ConvertType
)

// IBidStorageBid is an auto generated low-level Go binding around an user-defined struct.
type IBidStorageBid struct {
	Provider       common.Address
	ModelId        [32]byte
	PricePerSecond *big.Int
	Nonce          *big.Int
	CreatedAt      *big.Int
	DeletedAt      *big.Int
}

// IDelegateStakingCoreDelegateStakingParams is an auto generated low-level Go binding around an user-defined struct.
type IDelegateStakingCoreDelegateStakingParams struct {
	MinPrincipal       *big.Int
	MaxActiveFunders   *big.Int
	MaxAutoService     *big.Int
	MaxAutoReleaseDays *big.Int
	SettlementGrace    *big.Int
}

// IDelegateStakingCorePoolDebit is an auto generated low-level Go binding around an user-defined struct.
type IDelegateStakingCorePoolDebit struct {
	Funder common.Address
	Amount *big.Int
}

// IDelegateStakingCoreStakingGrant is an auto generated low-level Go binding around an user-defined struct.
type IDelegateStakingCoreStakingGrant struct {
	CumulativeFundingCap *big.Int
	LifetimeFunded       *big.Int
	CurrentPrincipal     *big.Int
	Locked               *big.Int
	PendingOwed          *big.Int
	Expiry               *big.Int
	IsRevoked            bool
	IsListed             bool
}

// DelegateStakingMetaData contains all meta data concerning the DelegateStaking contract.
var DelegateStakingMetaData = &bind.MetaData{
	ABI: "[{\"inputs\":[],\"name\":\"DelegateStakingFundingBelowMinimum\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingFundingExceedsMaxAmount\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingGrantExpired\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingGrantNotFound\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingGrantRevoked\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"uint256\",\"name\":\"available\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"requested\",\"type\":\"uint256\"}],\"name\":\"DelegateStakingInsufficientAuthorizedCapacity\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"uint256\",\"name\":\"available\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"requested\",\"type\":\"uint256\"}],\"name\":\"DelegateStakingInsufficientLiquidBalance\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingInvalidExpiry\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingMaxAmountTooLow\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingNothingToClaim\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingNothingToRelease\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingNothingToWithdraw\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"uint256\",\"name\":\"maxActiveFunders\",\"type\":\"uint256\"}],\"name\":\"DelegateStakingTooManyFunders\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingWithdrawalLeavesDust\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingZeroAddressProvided\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"DelegateStakingZeroAmountProvided\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"account_\",\"type\":\"address\"}],\"name\":\"OwnableUnauthorizedAccount\",\"type\":\"error\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"hot\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"funder\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"bytes32\",\"name\":\"sessionId\",\"type\":\"bytes32\"}],\"name\":\"AllowanceDebited\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"hot\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"funder\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint128\",\"name\":\"releaseAt\",\"type\":\"uint128\"}],\"name\":\"AllowanceHoldCreated\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"hot\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"funder\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"AllowanceReleased\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"funder\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"hot\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"AllowanceWithdrawQueued\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"funder\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"hot\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"AllowanceWithdrawn\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"minPrincipal\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"maxActiveFunders\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"maxAutoService\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"maxAutoReleaseDays\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"settlementGrace\",\"type\":\"uint256\"}],\"name\":\"DelegateStakingParamsUpdated\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"internalType\":\"bytes32\",\"name\":\"storageSlot\",\"type\":\"bytes32\"}],\"name\":\"Initialized\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"funder\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"hot\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"PendingWithdrawalPaid\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"funder\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"hot\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"}],\"name\":\"StakingAllowanceFunded\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"funder\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"hot\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"cumulativeFundingCap\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint128\",\"name\":\"expiry\",\"type\":\"uint128\"}],\"name\":\"StakingAllowanceGranted\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"funder\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"hot\",\"type\":\"address\"}],\"name\":\"StakingAllowanceRevoked\",\"type\":\"event\"},{\"inputs\":[],\"name\":\"BIDS_STORAGE_SLOT\",\"outputs\":[{\"internalType\":\"bytes32\",\"name\":\"\",\"type\":\"bytes32\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"DIAMOND_OWNABLE_STORAGE_SLOT\",\"outputs\":[{\"internalType\":\"bytes32\",\"name\":\"\",\"type\":\"bytes32\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"},{\"internalType\":\"uint8\",\"name\":\"iterations_\",\"type\":\"uint8\"}],\"name\":\"claimPendingWithdrawals\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"amount_\",\"type\":\"uint256\"}],\"name\":\"fundStakingAllowance\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"}],\"name\":\"getAvailableToStake\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"bytes32\",\"name\":\"bidId_\",\"type\":\"bytes32\"}],\"name\":\"getBid\",\"outputs\":[{\"components\":[{\"internalType\":\"address\",\"name\":\"provider\",\"type\":\"address\"},{\"internalType\":\"bytes32\",\"name\":\"modelId\",\"type\":\"bytes32\"},{\"internalType\":\"uint256\",\"name\":\"pricePerSecond\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"nonce\",\"type\":\"uint256\"},{\"internalType\":\"uint128\",\"name\":\"createdAt\",\"type\":\"uint128\"},{\"internalType\":\"uint128\",\"name\":\"deletedAt\",\"type\":\"uint128\"}],\"internalType\":\"structIBidStorage.Bid\",\"name\":\"\",\"type\":\"tuple\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"getDelegateStakingParams\",\"outputs\":[{\"components\":[{\"internalType\":\"uint256\",\"name\":\"minPrincipal\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"maxActiveFunders\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"maxAutoService\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"maxAutoReleaseDays\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"settlementGrace\",\"type\":\"uint256\"}],\"internalType\":\"structIDelegateStakingCore.DelegateStakingParams\",\"name\":\"\",\"type\":\"tuple\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"bytes32\",\"name\":\"modelId_\",\"type\":\"bytes32\"},{\"internalType\":\"uint256\",\"name\":\"offset_\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"limit_\",\"type\":\"uint256\"}],\"name\":\"getModelActiveBids\",\"outputs\":[{\"internalType\":\"bytes32[]\",\"name\":\"\",\"type\":\"bytes32[]\"},{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"bytes32\",\"name\":\"modelId_\",\"type\":\"bytes32\"},{\"internalType\":\"uint256\",\"name\":\"offset_\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"limit_\",\"type\":\"uint256\"}],\"name\":\"getModelBids\",\"outputs\":[{\"internalType\":\"bytes32[]\",\"name\":\"\",\"type\":\"bytes32[]\"},{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"funder_\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"}],\"name\":\"getPendingWithdrawal\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"}],\"name\":\"getPoolStakesOnHold\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"releasable_\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"held_\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"provider_\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"offset_\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"limit_\",\"type\":\"uint256\"}],\"name\":\"getProviderActiveBids\",\"outputs\":[{\"internalType\":\"bytes32[]\",\"name\":\"\",\"type\":\"bytes32[]\"},{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"provider_\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"offset_\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"limit_\",\"type\":\"uint256\"}],\"name\":\"getProviderBids\",\"outputs\":[{\"internalType\":\"bytes32[]\",\"name\":\"\",\"type\":\"bytes32[]\"},{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"bytes32\",\"name\":\"sessionId_\",\"type\":\"bytes32\"}],\"name\":\"getSessionFunding\",\"outputs\":[{\"components\":[{\"internalType\":\"address\",\"name\":\"funder\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"amount\",\"type\":\"uint256\"}],\"internalType\":\"structIDelegateStakingCore.PoolDebit[]\",\"name\":\"\",\"type\":\"tuple[]\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"funder_\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"}],\"name\":\"getStakingAllowance\",\"outputs\":[{\"components\":[{\"internalType\":\"uint256\",\"name\":\"cumulativeFundingCap\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"lifetimeFunded\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"currentPrincipal\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"locked\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"pendingOwed\",\"type\":\"uint256\"},{\"internalType\":\"uint128\",\"name\":\"expiry\",\"type\":\"uint128\"},{\"internalType\":\"bool\",\"name\":\"isRevoked\",\"type\":\"bool\"},{\"internalType\":\"bool\",\"name\":\"isListed\",\"type\":\"bool\"}],\"internalType\":\"structIDelegateStakingCore.StakingGrant\",\"name\":\"\",\"type\":\"tuple\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"}],\"name\":\"getStakingPool\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"freeBalance_\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"lockedBalance_\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"pendingTotal_\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"funderCount_\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"holdCount_\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"getToken\",\"outputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"cumulativeFundingCap_\",\"type\":\"uint256\"},{\"internalType\":\"uint128\",\"name\":\"expiry_\",\"type\":\"uint128\"}],\"name\":\"grantStakingAllowance\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"bytes32\",\"name\":\"bidId_\",\"type\":\"bytes32\"}],\"name\":\"isBidActive\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"offset_\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"limit_\",\"type\":\"uint256\"}],\"name\":\"listFundersOf\",\"outputs\":[{\"internalType\":\"address[]\",\"name\":\"funders_\",\"type\":\"address[]\"},{\"internalType\":\"uint256\",\"name\":\"total_\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"owner\",\"outputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"},{\"internalType\":\"uint8\",\"name\":\"iterations_\",\"type\":\"uint8\"}],\"name\":\"releasePoolHolds\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"}],\"name\":\"revokeStakingAllowance\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"components\":[{\"internalType\":\"uint256\",\"name\":\"minPrincipal\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"maxActiveFunders\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"maxAutoService\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"maxAutoReleaseDays\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"settlementGrace\",\"type\":\"uint256\"}],\"internalType\":\"structIDelegateStakingCore.DelegateStakingParams\",\"name\":\"params_\",\"type\":\"tuple\"}],\"name\":\"setDelegateStakingParams\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"hot_\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"amount_\",\"type\":\"uint256\"}],\"name\":\"withdrawStakingAllowance\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"}]",
}

// DelegateStakingABI is the input ABI used to generate the binding from.
// Deprecated: Use DelegateStakingMetaData.ABI instead.
var DelegateStakingABI = DelegateStakingMetaData.ABI

// DelegateStaking is an auto generated Go binding around an Ethereum contract.
type DelegateStaking struct {
	DelegateStakingCaller     // Read-only binding to the contract
	DelegateStakingTransactor // Write-only binding to the contract
	DelegateStakingFilterer   // Log filterer for contract events
}

// DelegateStakingCaller is an auto generated read-only Go binding around an Ethereum contract.
type DelegateStakingCaller struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// DelegateStakingTransactor is an auto generated write-only Go binding around an Ethereum contract.
type DelegateStakingTransactor struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// DelegateStakingFilterer is an auto generated log filtering Go binding around an Ethereum contract events.
type DelegateStakingFilterer struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// DelegateStakingSession is an auto generated Go binding around an Ethereum contract,
// with pre-set call and transact options.
type DelegateStakingSession struct {
	Contract     *DelegateStaking  // Generic contract binding to set the session for
	CallOpts     bind.CallOpts     // Call options to use throughout this session
	TransactOpts bind.TransactOpts // Transaction auth options to use throughout this session
}

// DelegateStakingCallerSession is an auto generated read-only Go binding around an Ethereum contract,
// with pre-set call options.
type DelegateStakingCallerSession struct {
	Contract *DelegateStakingCaller // Generic contract caller binding to set the session for
	CallOpts bind.CallOpts          // Call options to use throughout this session
}

// DelegateStakingTransactorSession is an auto generated write-only Go binding around an Ethereum contract,
// with pre-set transact options.
type DelegateStakingTransactorSession struct {
	Contract     *DelegateStakingTransactor // Generic contract transactor binding to set the session for
	TransactOpts bind.TransactOpts          // Transaction auth options to use throughout this session
}

// DelegateStakingRaw is an auto generated low-level Go binding around an Ethereum contract.
type DelegateStakingRaw struct {
	Contract *DelegateStaking // Generic contract binding to access the raw methods on
}

// DelegateStakingCallerRaw is an auto generated low-level read-only Go binding around an Ethereum contract.
type DelegateStakingCallerRaw struct {
	Contract *DelegateStakingCaller // Generic read-only contract binding to access the raw methods on
}

// DelegateStakingTransactorRaw is an auto generated low-level write-only Go binding around an Ethereum contract.
type DelegateStakingTransactorRaw struct {
	Contract *DelegateStakingTransactor // Generic write-only contract binding to access the raw methods on
}

// NewDelegateStaking creates a new instance of DelegateStaking, bound to a specific deployed contract.
func NewDelegateStaking(address common.Address, backend bind.ContractBackend) (*DelegateStaking, error) {
	contract, err := bindDelegateStaking(address, backend, backend, backend)
	if err != nil {
		return nil, err
	}
	return &DelegateStaking{DelegateStakingCaller: DelegateStakingCaller{contract: contract}, DelegateStakingTransactor: DelegateStakingTransactor{contract: contract}, DelegateStakingFilterer: DelegateStakingFilterer{contract: contract}}, nil
}

// NewDelegateStakingCaller creates a new read-only instance of DelegateStaking, bound to a specific deployed contract.
func NewDelegateStakingCaller(address common.Address, caller bind.ContractCaller) (*DelegateStakingCaller, error) {
	contract, err := bindDelegateStaking(address, caller, nil, nil)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingCaller{contract: contract}, nil
}

// NewDelegateStakingTransactor creates a new write-only instance of DelegateStaking, bound to a specific deployed contract.
func NewDelegateStakingTransactor(address common.Address, transactor bind.ContractTransactor) (*DelegateStakingTransactor, error) {
	contract, err := bindDelegateStaking(address, nil, transactor, nil)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingTransactor{contract: contract}, nil
}

// NewDelegateStakingFilterer creates a new log filterer instance of DelegateStaking, bound to a specific deployed contract.
func NewDelegateStakingFilterer(address common.Address, filterer bind.ContractFilterer) (*DelegateStakingFilterer, error) {
	contract, err := bindDelegateStaking(address, nil, nil, filterer)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingFilterer{contract: contract}, nil
}

// bindDelegateStaking binds a generic wrapper to an already deployed contract.
func bindDelegateStaking(address common.Address, caller bind.ContractCaller, transactor bind.ContractTransactor, filterer bind.ContractFilterer) (*bind.BoundContract, error) {
	parsed, err := DelegateStakingMetaData.GetAbi()
	if err != nil {
		return nil, err
	}
	return bind.NewBoundContract(address, *parsed, caller, transactor, filterer), nil
}

// Call invokes the (constant) contract method with params as input values and
// sets the output to result. The result type might be a single field for simple
// returns, a slice of interfaces for anonymous returns and a struct for named
// returns.
func (_DelegateStaking *DelegateStakingRaw) Call(opts *bind.CallOpts, result *[]interface{}, method string, params ...interface{}) error {
	return _DelegateStaking.Contract.DelegateStakingCaller.contract.Call(opts, result, method, params...)
}

// Transfer initiates a plain transaction to move funds to the contract, calling
// its default method if one is available.
func (_DelegateStaking *DelegateStakingRaw) Transfer(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _DelegateStaking.Contract.DelegateStakingTransactor.contract.Transfer(opts)
}

// Transact invokes the (paid) contract method with params as input values.
func (_DelegateStaking *DelegateStakingRaw) Transact(opts *bind.TransactOpts, method string, params ...interface{}) (*types.Transaction, error) {
	return _DelegateStaking.Contract.DelegateStakingTransactor.contract.Transact(opts, method, params...)
}

// Call invokes the (constant) contract method with params as input values and
// sets the output to result. The result type might be a single field for simple
// returns, a slice of interfaces for anonymous returns and a struct for named
// returns.
func (_DelegateStaking *DelegateStakingCallerRaw) Call(opts *bind.CallOpts, result *[]interface{}, method string, params ...interface{}) error {
	return _DelegateStaking.Contract.contract.Call(opts, result, method, params...)
}

// Transfer initiates a plain transaction to move funds to the contract, calling
// its default method if one is available.
func (_DelegateStaking *DelegateStakingTransactorRaw) Transfer(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _DelegateStaking.Contract.contract.Transfer(opts)
}

// Transact invokes the (paid) contract method with params as input values.
func (_DelegateStaking *DelegateStakingTransactorRaw) Transact(opts *bind.TransactOpts, method string, params ...interface{}) (*types.Transaction, error) {
	return _DelegateStaking.Contract.contract.Transact(opts, method, params...)
}

// BIDSSTORAGESLOT is a free data retrieval call binding the contract method 0x266ccff0.
//
// Solidity: function BIDS_STORAGE_SLOT() view returns(bytes32)
func (_DelegateStaking *DelegateStakingCaller) BIDSSTORAGESLOT(opts *bind.CallOpts) ([32]byte, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "BIDS_STORAGE_SLOT")

	if err != nil {
		return *new([32]byte), err
	}

	out0 := *abi.ConvertType(out[0], new([32]byte)).(*[32]byte)

	return out0, err

}

// BIDSSTORAGESLOT is a free data retrieval call binding the contract method 0x266ccff0.
//
// Solidity: function BIDS_STORAGE_SLOT() view returns(bytes32)
func (_DelegateStaking *DelegateStakingSession) BIDSSTORAGESLOT() ([32]byte, error) {
	return _DelegateStaking.Contract.BIDSSTORAGESLOT(&_DelegateStaking.CallOpts)
}

// BIDSSTORAGESLOT is a free data retrieval call binding the contract method 0x266ccff0.
//
// Solidity: function BIDS_STORAGE_SLOT() view returns(bytes32)
func (_DelegateStaking *DelegateStakingCallerSession) BIDSSTORAGESLOT() ([32]byte, error) {
	return _DelegateStaking.Contract.BIDSSTORAGESLOT(&_DelegateStaking.CallOpts)
}

// DIAMONDOWNABLESTORAGESLOT is a free data retrieval call binding the contract method 0x4ac3371e.
//
// Solidity: function DIAMOND_OWNABLE_STORAGE_SLOT() view returns(bytes32)
func (_DelegateStaking *DelegateStakingCaller) DIAMONDOWNABLESTORAGESLOT(opts *bind.CallOpts) ([32]byte, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "DIAMOND_OWNABLE_STORAGE_SLOT")

	if err != nil {
		return *new([32]byte), err
	}

	out0 := *abi.ConvertType(out[0], new([32]byte)).(*[32]byte)

	return out0, err

}

// DIAMONDOWNABLESTORAGESLOT is a free data retrieval call binding the contract method 0x4ac3371e.
//
// Solidity: function DIAMOND_OWNABLE_STORAGE_SLOT() view returns(bytes32)
func (_DelegateStaking *DelegateStakingSession) DIAMONDOWNABLESTORAGESLOT() ([32]byte, error) {
	return _DelegateStaking.Contract.DIAMONDOWNABLESTORAGESLOT(&_DelegateStaking.CallOpts)
}

// DIAMONDOWNABLESTORAGESLOT is a free data retrieval call binding the contract method 0x4ac3371e.
//
// Solidity: function DIAMOND_OWNABLE_STORAGE_SLOT() view returns(bytes32)
func (_DelegateStaking *DelegateStakingCallerSession) DIAMONDOWNABLESTORAGESLOT() ([32]byte, error) {
	return _DelegateStaking.Contract.DIAMONDOWNABLESTORAGESLOT(&_DelegateStaking.CallOpts)
}

// GetAvailableToStake is a free data retrieval call binding the contract method 0xe9cc2eb0.
//
// Solidity: function getAvailableToStake(address hot_) view returns(uint256)
func (_DelegateStaking *DelegateStakingCaller) GetAvailableToStake(opts *bind.CallOpts, hot_ common.Address) (*big.Int, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getAvailableToStake", hot_)

	if err != nil {
		return *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)

	return out0, err

}

// GetAvailableToStake is a free data retrieval call binding the contract method 0xe9cc2eb0.
//
// Solidity: function getAvailableToStake(address hot_) view returns(uint256)
func (_DelegateStaking *DelegateStakingSession) GetAvailableToStake(hot_ common.Address) (*big.Int, error) {
	return _DelegateStaking.Contract.GetAvailableToStake(&_DelegateStaking.CallOpts, hot_)
}

// GetAvailableToStake is a free data retrieval call binding the contract method 0xe9cc2eb0.
//
// Solidity: function getAvailableToStake(address hot_) view returns(uint256)
func (_DelegateStaking *DelegateStakingCallerSession) GetAvailableToStake(hot_ common.Address) (*big.Int, error) {
	return _DelegateStaking.Contract.GetAvailableToStake(&_DelegateStaking.CallOpts, hot_)
}

// GetBid is a free data retrieval call binding the contract method 0x91704e1e.
//
// Solidity: function getBid(bytes32 bidId_) view returns((address,bytes32,uint256,uint256,uint128,uint128))
func (_DelegateStaking *DelegateStakingCaller) GetBid(opts *bind.CallOpts, bidId_ [32]byte) (IBidStorageBid, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getBid", bidId_)

	if err != nil {
		return *new(IBidStorageBid), err
	}

	out0 := *abi.ConvertType(out[0], new(IBidStorageBid)).(*IBidStorageBid)

	return out0, err

}

// GetBid is a free data retrieval call binding the contract method 0x91704e1e.
//
// Solidity: function getBid(bytes32 bidId_) view returns((address,bytes32,uint256,uint256,uint128,uint128))
func (_DelegateStaking *DelegateStakingSession) GetBid(bidId_ [32]byte) (IBidStorageBid, error) {
	return _DelegateStaking.Contract.GetBid(&_DelegateStaking.CallOpts, bidId_)
}

// GetBid is a free data retrieval call binding the contract method 0x91704e1e.
//
// Solidity: function getBid(bytes32 bidId_) view returns((address,bytes32,uint256,uint256,uint128,uint128))
func (_DelegateStaking *DelegateStakingCallerSession) GetBid(bidId_ [32]byte) (IBidStorageBid, error) {
	return _DelegateStaking.Contract.GetBid(&_DelegateStaking.CallOpts, bidId_)
}

// GetDelegateStakingParams is a free data retrieval call binding the contract method 0xf56c5dc9.
//
// Solidity: function getDelegateStakingParams() view returns((uint256,uint256,uint256,uint256,uint256))
func (_DelegateStaking *DelegateStakingCaller) GetDelegateStakingParams(opts *bind.CallOpts) (IDelegateStakingCoreDelegateStakingParams, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getDelegateStakingParams")

	if err != nil {
		return *new(IDelegateStakingCoreDelegateStakingParams), err
	}

	out0 := *abi.ConvertType(out[0], new(IDelegateStakingCoreDelegateStakingParams)).(*IDelegateStakingCoreDelegateStakingParams)

	return out0, err

}

// GetDelegateStakingParams is a free data retrieval call binding the contract method 0xf56c5dc9.
//
// Solidity: function getDelegateStakingParams() view returns((uint256,uint256,uint256,uint256,uint256))
func (_DelegateStaking *DelegateStakingSession) GetDelegateStakingParams() (IDelegateStakingCoreDelegateStakingParams, error) {
	return _DelegateStaking.Contract.GetDelegateStakingParams(&_DelegateStaking.CallOpts)
}

// GetDelegateStakingParams is a free data retrieval call binding the contract method 0xf56c5dc9.
//
// Solidity: function getDelegateStakingParams() view returns((uint256,uint256,uint256,uint256,uint256))
func (_DelegateStaking *DelegateStakingCallerSession) GetDelegateStakingParams() (IDelegateStakingCoreDelegateStakingParams, error) {
	return _DelegateStaking.Contract.GetDelegateStakingParams(&_DelegateStaking.CallOpts)
}

// GetModelActiveBids is a free data retrieval call binding the contract method 0x8a683b6e.
//
// Solidity: function getModelActiveBids(bytes32 modelId_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingCaller) GetModelActiveBids(opts *bind.CallOpts, modelId_ [32]byte, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getModelActiveBids", modelId_, offset_, limit_)

	if err != nil {
		return *new([][32]byte), *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new([][32]byte)).(*[][32]byte)
	out1 := *abi.ConvertType(out[1], new(*big.Int)).(**big.Int)

	return out0, out1, err

}

// GetModelActiveBids is a free data retrieval call binding the contract method 0x8a683b6e.
//
// Solidity: function getModelActiveBids(bytes32 modelId_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingSession) GetModelActiveBids(modelId_ [32]byte, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	return _DelegateStaking.Contract.GetModelActiveBids(&_DelegateStaking.CallOpts, modelId_, offset_, limit_)
}

// GetModelActiveBids is a free data retrieval call binding the contract method 0x8a683b6e.
//
// Solidity: function getModelActiveBids(bytes32 modelId_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingCallerSession) GetModelActiveBids(modelId_ [32]byte, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	return _DelegateStaking.Contract.GetModelActiveBids(&_DelegateStaking.CallOpts, modelId_, offset_, limit_)
}

// GetModelBids is a free data retrieval call binding the contract method 0xfade17b1.
//
// Solidity: function getModelBids(bytes32 modelId_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingCaller) GetModelBids(opts *bind.CallOpts, modelId_ [32]byte, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getModelBids", modelId_, offset_, limit_)

	if err != nil {
		return *new([][32]byte), *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new([][32]byte)).(*[][32]byte)
	out1 := *abi.ConvertType(out[1], new(*big.Int)).(**big.Int)

	return out0, out1, err

}

// GetModelBids is a free data retrieval call binding the contract method 0xfade17b1.
//
// Solidity: function getModelBids(bytes32 modelId_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingSession) GetModelBids(modelId_ [32]byte, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	return _DelegateStaking.Contract.GetModelBids(&_DelegateStaking.CallOpts, modelId_, offset_, limit_)
}

// GetModelBids is a free data retrieval call binding the contract method 0xfade17b1.
//
// Solidity: function getModelBids(bytes32 modelId_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingCallerSession) GetModelBids(modelId_ [32]byte, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	return _DelegateStaking.Contract.GetModelBids(&_DelegateStaking.CallOpts, modelId_, offset_, limit_)
}

// GetPendingWithdrawal is a free data retrieval call binding the contract method 0x5699c7b1.
//
// Solidity: function getPendingWithdrawal(address funder_, address hot_) view returns(uint256)
func (_DelegateStaking *DelegateStakingCaller) GetPendingWithdrawal(opts *bind.CallOpts, funder_ common.Address, hot_ common.Address) (*big.Int, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getPendingWithdrawal", funder_, hot_)

	if err != nil {
		return *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)

	return out0, err

}

// GetPendingWithdrawal is a free data retrieval call binding the contract method 0x5699c7b1.
//
// Solidity: function getPendingWithdrawal(address funder_, address hot_) view returns(uint256)
func (_DelegateStaking *DelegateStakingSession) GetPendingWithdrawal(funder_ common.Address, hot_ common.Address) (*big.Int, error) {
	return _DelegateStaking.Contract.GetPendingWithdrawal(&_DelegateStaking.CallOpts, funder_, hot_)
}

// GetPendingWithdrawal is a free data retrieval call binding the contract method 0x5699c7b1.
//
// Solidity: function getPendingWithdrawal(address funder_, address hot_) view returns(uint256)
func (_DelegateStaking *DelegateStakingCallerSession) GetPendingWithdrawal(funder_ common.Address, hot_ common.Address) (*big.Int, error) {
	return _DelegateStaking.Contract.GetPendingWithdrawal(&_DelegateStaking.CallOpts, funder_, hot_)
}

// GetPoolStakesOnHold is a free data retrieval call binding the contract method 0x8838b6be.
//
// Solidity: function getPoolStakesOnHold(address hot_) view returns(uint256 releasable_, uint256 held_)
func (_DelegateStaking *DelegateStakingCaller) GetPoolStakesOnHold(opts *bind.CallOpts, hot_ common.Address) (struct {
	Releasable *big.Int
	Held       *big.Int
}, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getPoolStakesOnHold", hot_)

	outstruct := new(struct {
		Releasable *big.Int
		Held       *big.Int
	})
	if err != nil {
		return *outstruct, err
	}

	outstruct.Releasable = *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)
	outstruct.Held = *abi.ConvertType(out[1], new(*big.Int)).(**big.Int)

	return *outstruct, err

}

// GetPoolStakesOnHold is a free data retrieval call binding the contract method 0x8838b6be.
//
// Solidity: function getPoolStakesOnHold(address hot_) view returns(uint256 releasable_, uint256 held_)
func (_DelegateStaking *DelegateStakingSession) GetPoolStakesOnHold(hot_ common.Address) (struct {
	Releasable *big.Int
	Held       *big.Int
}, error) {
	return _DelegateStaking.Contract.GetPoolStakesOnHold(&_DelegateStaking.CallOpts, hot_)
}

// GetPoolStakesOnHold is a free data retrieval call binding the contract method 0x8838b6be.
//
// Solidity: function getPoolStakesOnHold(address hot_) view returns(uint256 releasable_, uint256 held_)
func (_DelegateStaking *DelegateStakingCallerSession) GetPoolStakesOnHold(hot_ common.Address) (struct {
	Releasable *big.Int
	Held       *big.Int
}, error) {
	return _DelegateStaking.Contract.GetPoolStakesOnHold(&_DelegateStaking.CallOpts, hot_)
}

// GetProviderActiveBids is a free data retrieval call binding the contract method 0xaf5b77ca.
//
// Solidity: function getProviderActiveBids(address provider_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingCaller) GetProviderActiveBids(opts *bind.CallOpts, provider_ common.Address, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getProviderActiveBids", provider_, offset_, limit_)

	if err != nil {
		return *new([][32]byte), *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new([][32]byte)).(*[][32]byte)
	out1 := *abi.ConvertType(out[1], new(*big.Int)).(**big.Int)

	return out0, out1, err

}

// GetProviderActiveBids is a free data retrieval call binding the contract method 0xaf5b77ca.
//
// Solidity: function getProviderActiveBids(address provider_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingSession) GetProviderActiveBids(provider_ common.Address, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	return _DelegateStaking.Contract.GetProviderActiveBids(&_DelegateStaking.CallOpts, provider_, offset_, limit_)
}

// GetProviderActiveBids is a free data retrieval call binding the contract method 0xaf5b77ca.
//
// Solidity: function getProviderActiveBids(address provider_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingCallerSession) GetProviderActiveBids(provider_ common.Address, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	return _DelegateStaking.Contract.GetProviderActiveBids(&_DelegateStaking.CallOpts, provider_, offset_, limit_)
}

// GetProviderBids is a free data retrieval call binding the contract method 0x59d435c4.
//
// Solidity: function getProviderBids(address provider_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingCaller) GetProviderBids(opts *bind.CallOpts, provider_ common.Address, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getProviderBids", provider_, offset_, limit_)

	if err != nil {
		return *new([][32]byte), *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new([][32]byte)).(*[][32]byte)
	out1 := *abi.ConvertType(out[1], new(*big.Int)).(**big.Int)

	return out0, out1, err

}

// GetProviderBids is a free data retrieval call binding the contract method 0x59d435c4.
//
// Solidity: function getProviderBids(address provider_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingSession) GetProviderBids(provider_ common.Address, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	return _DelegateStaking.Contract.GetProviderBids(&_DelegateStaking.CallOpts, provider_, offset_, limit_)
}

// GetProviderBids is a free data retrieval call binding the contract method 0x59d435c4.
//
// Solidity: function getProviderBids(address provider_, uint256 offset_, uint256 limit_) view returns(bytes32[], uint256)
func (_DelegateStaking *DelegateStakingCallerSession) GetProviderBids(provider_ common.Address, offset_ *big.Int, limit_ *big.Int) ([][32]byte, *big.Int, error) {
	return _DelegateStaking.Contract.GetProviderBids(&_DelegateStaking.CallOpts, provider_, offset_, limit_)
}

// GetSessionFunding is a free data retrieval call binding the contract method 0xcbb44f95.
//
// Solidity: function getSessionFunding(bytes32 sessionId_) view returns((address,uint256)[])
func (_DelegateStaking *DelegateStakingCaller) GetSessionFunding(opts *bind.CallOpts, sessionId_ [32]byte) ([]IDelegateStakingCorePoolDebit, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getSessionFunding", sessionId_)

	if err != nil {
		return *new([]IDelegateStakingCorePoolDebit), err
	}

	out0 := *abi.ConvertType(out[0], new([]IDelegateStakingCorePoolDebit)).(*[]IDelegateStakingCorePoolDebit)

	return out0, err

}

// GetSessionFunding is a free data retrieval call binding the contract method 0xcbb44f95.
//
// Solidity: function getSessionFunding(bytes32 sessionId_) view returns((address,uint256)[])
func (_DelegateStaking *DelegateStakingSession) GetSessionFunding(sessionId_ [32]byte) ([]IDelegateStakingCorePoolDebit, error) {
	return _DelegateStaking.Contract.GetSessionFunding(&_DelegateStaking.CallOpts, sessionId_)
}

// GetSessionFunding is a free data retrieval call binding the contract method 0xcbb44f95.
//
// Solidity: function getSessionFunding(bytes32 sessionId_) view returns((address,uint256)[])
func (_DelegateStaking *DelegateStakingCallerSession) GetSessionFunding(sessionId_ [32]byte) ([]IDelegateStakingCorePoolDebit, error) {
	return _DelegateStaking.Contract.GetSessionFunding(&_DelegateStaking.CallOpts, sessionId_)
}

// GetStakingAllowance is a free data retrieval call binding the contract method 0x064f8571.
//
// Solidity: function getStakingAllowance(address funder_, address hot_) view returns((uint256,uint256,uint256,uint256,uint256,uint128,bool,bool))
func (_DelegateStaking *DelegateStakingCaller) GetStakingAllowance(opts *bind.CallOpts, funder_ common.Address, hot_ common.Address) (IDelegateStakingCoreStakingGrant, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getStakingAllowance", funder_, hot_)

	if err != nil {
		return *new(IDelegateStakingCoreStakingGrant), err
	}

	out0 := *abi.ConvertType(out[0], new(IDelegateStakingCoreStakingGrant)).(*IDelegateStakingCoreStakingGrant)

	return out0, err

}

// GetStakingAllowance is a free data retrieval call binding the contract method 0x064f8571.
//
// Solidity: function getStakingAllowance(address funder_, address hot_) view returns((uint256,uint256,uint256,uint256,uint256,uint128,bool,bool))
func (_DelegateStaking *DelegateStakingSession) GetStakingAllowance(funder_ common.Address, hot_ common.Address) (IDelegateStakingCoreStakingGrant, error) {
	return _DelegateStaking.Contract.GetStakingAllowance(&_DelegateStaking.CallOpts, funder_, hot_)
}

// GetStakingAllowance is a free data retrieval call binding the contract method 0x064f8571.
//
// Solidity: function getStakingAllowance(address funder_, address hot_) view returns((uint256,uint256,uint256,uint256,uint256,uint128,bool,bool))
func (_DelegateStaking *DelegateStakingCallerSession) GetStakingAllowance(funder_ common.Address, hot_ common.Address) (IDelegateStakingCoreStakingGrant, error) {
	return _DelegateStaking.Contract.GetStakingAllowance(&_DelegateStaking.CallOpts, funder_, hot_)
}

// GetStakingPool is a free data retrieval call binding the contract method 0x9e614e0e.
//
// Solidity: function getStakingPool(address hot_) view returns(uint256 freeBalance_, uint256 lockedBalance_, uint256 pendingTotal_, uint256 funderCount_, uint256 holdCount_)
func (_DelegateStaking *DelegateStakingCaller) GetStakingPool(opts *bind.CallOpts, hot_ common.Address) (struct {
	FreeBalance   *big.Int
	LockedBalance *big.Int
	PendingTotal  *big.Int
	FunderCount   *big.Int
	HoldCount     *big.Int
}, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getStakingPool", hot_)

	outstruct := new(struct {
		FreeBalance   *big.Int
		LockedBalance *big.Int
		PendingTotal  *big.Int
		FunderCount   *big.Int
		HoldCount     *big.Int
	})
	if err != nil {
		return *outstruct, err
	}

	outstruct.FreeBalance = *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)
	outstruct.LockedBalance = *abi.ConvertType(out[1], new(*big.Int)).(**big.Int)
	outstruct.PendingTotal = *abi.ConvertType(out[2], new(*big.Int)).(**big.Int)
	outstruct.FunderCount = *abi.ConvertType(out[3], new(*big.Int)).(**big.Int)
	outstruct.HoldCount = *abi.ConvertType(out[4], new(*big.Int)).(**big.Int)

	return *outstruct, err

}

// GetStakingPool is a free data retrieval call binding the contract method 0x9e614e0e.
//
// Solidity: function getStakingPool(address hot_) view returns(uint256 freeBalance_, uint256 lockedBalance_, uint256 pendingTotal_, uint256 funderCount_, uint256 holdCount_)
func (_DelegateStaking *DelegateStakingSession) GetStakingPool(hot_ common.Address) (struct {
	FreeBalance   *big.Int
	LockedBalance *big.Int
	PendingTotal  *big.Int
	FunderCount   *big.Int
	HoldCount     *big.Int
}, error) {
	return _DelegateStaking.Contract.GetStakingPool(&_DelegateStaking.CallOpts, hot_)
}

// GetStakingPool is a free data retrieval call binding the contract method 0x9e614e0e.
//
// Solidity: function getStakingPool(address hot_) view returns(uint256 freeBalance_, uint256 lockedBalance_, uint256 pendingTotal_, uint256 funderCount_, uint256 holdCount_)
func (_DelegateStaking *DelegateStakingCallerSession) GetStakingPool(hot_ common.Address) (struct {
	FreeBalance   *big.Int
	LockedBalance *big.Int
	PendingTotal  *big.Int
	FunderCount   *big.Int
	HoldCount     *big.Int
}, error) {
	return _DelegateStaking.Contract.GetStakingPool(&_DelegateStaking.CallOpts, hot_)
}

// GetToken is a free data retrieval call binding the contract method 0x21df0da7.
//
// Solidity: function getToken() view returns(address)
func (_DelegateStaking *DelegateStakingCaller) GetToken(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "getToken")

	if err != nil {
		return *new(common.Address), err
	}

	out0 := *abi.ConvertType(out[0], new(common.Address)).(*common.Address)

	return out0, err

}

// GetToken is a free data retrieval call binding the contract method 0x21df0da7.
//
// Solidity: function getToken() view returns(address)
func (_DelegateStaking *DelegateStakingSession) GetToken() (common.Address, error) {
	return _DelegateStaking.Contract.GetToken(&_DelegateStaking.CallOpts)
}

// GetToken is a free data retrieval call binding the contract method 0x21df0da7.
//
// Solidity: function getToken() view returns(address)
func (_DelegateStaking *DelegateStakingCallerSession) GetToken() (common.Address, error) {
	return _DelegateStaking.Contract.GetToken(&_DelegateStaking.CallOpts)
}

// IsBidActive is a free data retrieval call binding the contract method 0x1345df58.
//
// Solidity: function isBidActive(bytes32 bidId_) view returns(bool)
func (_DelegateStaking *DelegateStakingCaller) IsBidActive(opts *bind.CallOpts, bidId_ [32]byte) (bool, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "isBidActive", bidId_)

	if err != nil {
		return *new(bool), err
	}

	out0 := *abi.ConvertType(out[0], new(bool)).(*bool)

	return out0, err

}

// IsBidActive is a free data retrieval call binding the contract method 0x1345df58.
//
// Solidity: function isBidActive(bytes32 bidId_) view returns(bool)
func (_DelegateStaking *DelegateStakingSession) IsBidActive(bidId_ [32]byte) (bool, error) {
	return _DelegateStaking.Contract.IsBidActive(&_DelegateStaking.CallOpts, bidId_)
}

// IsBidActive is a free data retrieval call binding the contract method 0x1345df58.
//
// Solidity: function isBidActive(bytes32 bidId_) view returns(bool)
func (_DelegateStaking *DelegateStakingCallerSession) IsBidActive(bidId_ [32]byte) (bool, error) {
	return _DelegateStaking.Contract.IsBidActive(&_DelegateStaking.CallOpts, bidId_)
}

// ListFundersOf is a free data retrieval call binding the contract method 0xef076030.
//
// Solidity: function listFundersOf(address hot_, uint256 offset_, uint256 limit_) view returns(address[] funders_, uint256 total_)
func (_DelegateStaking *DelegateStakingCaller) ListFundersOf(opts *bind.CallOpts, hot_ common.Address, offset_ *big.Int, limit_ *big.Int) (struct {
	Funders []common.Address
	Total   *big.Int
}, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "listFundersOf", hot_, offset_, limit_)

	outstruct := new(struct {
		Funders []common.Address
		Total   *big.Int
	})
	if err != nil {
		return *outstruct, err
	}

	outstruct.Funders = *abi.ConvertType(out[0], new([]common.Address)).(*[]common.Address)
	outstruct.Total = *abi.ConvertType(out[1], new(*big.Int)).(**big.Int)

	return *outstruct, err

}

// ListFundersOf is a free data retrieval call binding the contract method 0xef076030.
//
// Solidity: function listFundersOf(address hot_, uint256 offset_, uint256 limit_) view returns(address[] funders_, uint256 total_)
func (_DelegateStaking *DelegateStakingSession) ListFundersOf(hot_ common.Address, offset_ *big.Int, limit_ *big.Int) (struct {
	Funders []common.Address
	Total   *big.Int
}, error) {
	return _DelegateStaking.Contract.ListFundersOf(&_DelegateStaking.CallOpts, hot_, offset_, limit_)
}

// ListFundersOf is a free data retrieval call binding the contract method 0xef076030.
//
// Solidity: function listFundersOf(address hot_, uint256 offset_, uint256 limit_) view returns(address[] funders_, uint256 total_)
func (_DelegateStaking *DelegateStakingCallerSession) ListFundersOf(hot_ common.Address, offset_ *big.Int, limit_ *big.Int) (struct {
	Funders []common.Address
	Total   *big.Int
}, error) {
	return _DelegateStaking.Contract.ListFundersOf(&_DelegateStaking.CallOpts, hot_, offset_, limit_)
}

// Owner is a free data retrieval call binding the contract method 0x8da5cb5b.
//
// Solidity: function owner() view returns(address)
func (_DelegateStaking *DelegateStakingCaller) Owner(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := _DelegateStaking.contract.Call(opts, &out, "owner")

	if err != nil {
		return *new(common.Address), err
	}

	out0 := *abi.ConvertType(out[0], new(common.Address)).(*common.Address)

	return out0, err

}

// Owner is a free data retrieval call binding the contract method 0x8da5cb5b.
//
// Solidity: function owner() view returns(address)
func (_DelegateStaking *DelegateStakingSession) Owner() (common.Address, error) {
	return _DelegateStaking.Contract.Owner(&_DelegateStaking.CallOpts)
}

// Owner is a free data retrieval call binding the contract method 0x8da5cb5b.
//
// Solidity: function owner() view returns(address)
func (_DelegateStaking *DelegateStakingCallerSession) Owner() (common.Address, error) {
	return _DelegateStaking.Contract.Owner(&_DelegateStaking.CallOpts)
}

// ClaimPendingWithdrawals is a paid mutator transaction binding the contract method 0x2436a2fc.
//
// Solidity: function claimPendingWithdrawals(address hot_, uint8 iterations_) returns()
func (_DelegateStaking *DelegateStakingTransactor) ClaimPendingWithdrawals(opts *bind.TransactOpts, hot_ common.Address, iterations_ uint8) (*types.Transaction, error) {
	return _DelegateStaking.contract.Transact(opts, "claimPendingWithdrawals", hot_, iterations_)
}

// ClaimPendingWithdrawals is a paid mutator transaction binding the contract method 0x2436a2fc.
//
// Solidity: function claimPendingWithdrawals(address hot_, uint8 iterations_) returns()
func (_DelegateStaking *DelegateStakingSession) ClaimPendingWithdrawals(hot_ common.Address, iterations_ uint8) (*types.Transaction, error) {
	return _DelegateStaking.Contract.ClaimPendingWithdrawals(&_DelegateStaking.TransactOpts, hot_, iterations_)
}

// ClaimPendingWithdrawals is a paid mutator transaction binding the contract method 0x2436a2fc.
//
// Solidity: function claimPendingWithdrawals(address hot_, uint8 iterations_) returns()
func (_DelegateStaking *DelegateStakingTransactorSession) ClaimPendingWithdrawals(hot_ common.Address, iterations_ uint8) (*types.Transaction, error) {
	return _DelegateStaking.Contract.ClaimPendingWithdrawals(&_DelegateStaking.TransactOpts, hot_, iterations_)
}

// FundStakingAllowance is a paid mutator transaction binding the contract method 0x42ee6c53.
//
// Solidity: function fundStakingAllowance(address hot_, uint256 amount_) returns()
func (_DelegateStaking *DelegateStakingTransactor) FundStakingAllowance(opts *bind.TransactOpts, hot_ common.Address, amount_ *big.Int) (*types.Transaction, error) {
	return _DelegateStaking.contract.Transact(opts, "fundStakingAllowance", hot_, amount_)
}

// FundStakingAllowance is a paid mutator transaction binding the contract method 0x42ee6c53.
//
// Solidity: function fundStakingAllowance(address hot_, uint256 amount_) returns()
func (_DelegateStaking *DelegateStakingSession) FundStakingAllowance(hot_ common.Address, amount_ *big.Int) (*types.Transaction, error) {
	return _DelegateStaking.Contract.FundStakingAllowance(&_DelegateStaking.TransactOpts, hot_, amount_)
}

// FundStakingAllowance is a paid mutator transaction binding the contract method 0x42ee6c53.
//
// Solidity: function fundStakingAllowance(address hot_, uint256 amount_) returns()
func (_DelegateStaking *DelegateStakingTransactorSession) FundStakingAllowance(hot_ common.Address, amount_ *big.Int) (*types.Transaction, error) {
	return _DelegateStaking.Contract.FundStakingAllowance(&_DelegateStaking.TransactOpts, hot_, amount_)
}

// GrantStakingAllowance is a paid mutator transaction binding the contract method 0x2623a8a7.
//
// Solidity: function grantStakingAllowance(address hot_, uint256 cumulativeFundingCap_, uint128 expiry_) returns()
func (_DelegateStaking *DelegateStakingTransactor) GrantStakingAllowance(opts *bind.TransactOpts, hot_ common.Address, cumulativeFundingCap_ *big.Int, expiry_ *big.Int) (*types.Transaction, error) {
	return _DelegateStaking.contract.Transact(opts, "grantStakingAllowance", hot_, cumulativeFundingCap_, expiry_)
}

// GrantStakingAllowance is a paid mutator transaction binding the contract method 0x2623a8a7.
//
// Solidity: function grantStakingAllowance(address hot_, uint256 cumulativeFundingCap_, uint128 expiry_) returns()
func (_DelegateStaking *DelegateStakingSession) GrantStakingAllowance(hot_ common.Address, cumulativeFundingCap_ *big.Int, expiry_ *big.Int) (*types.Transaction, error) {
	return _DelegateStaking.Contract.GrantStakingAllowance(&_DelegateStaking.TransactOpts, hot_, cumulativeFundingCap_, expiry_)
}

// GrantStakingAllowance is a paid mutator transaction binding the contract method 0x2623a8a7.
//
// Solidity: function grantStakingAllowance(address hot_, uint256 cumulativeFundingCap_, uint128 expiry_) returns()
func (_DelegateStaking *DelegateStakingTransactorSession) GrantStakingAllowance(hot_ common.Address, cumulativeFundingCap_ *big.Int, expiry_ *big.Int) (*types.Transaction, error) {
	return _DelegateStaking.Contract.GrantStakingAllowance(&_DelegateStaking.TransactOpts, hot_, cumulativeFundingCap_, expiry_)
}

// ReleasePoolHolds is a paid mutator transaction binding the contract method 0xcb2fe150.
//
// Solidity: function releasePoolHolds(address hot_, uint8 iterations_) returns()
func (_DelegateStaking *DelegateStakingTransactor) ReleasePoolHolds(opts *bind.TransactOpts, hot_ common.Address, iterations_ uint8) (*types.Transaction, error) {
	return _DelegateStaking.contract.Transact(opts, "releasePoolHolds", hot_, iterations_)
}

// ReleasePoolHolds is a paid mutator transaction binding the contract method 0xcb2fe150.
//
// Solidity: function releasePoolHolds(address hot_, uint8 iterations_) returns()
func (_DelegateStaking *DelegateStakingSession) ReleasePoolHolds(hot_ common.Address, iterations_ uint8) (*types.Transaction, error) {
	return _DelegateStaking.Contract.ReleasePoolHolds(&_DelegateStaking.TransactOpts, hot_, iterations_)
}

// ReleasePoolHolds is a paid mutator transaction binding the contract method 0xcb2fe150.
//
// Solidity: function releasePoolHolds(address hot_, uint8 iterations_) returns()
func (_DelegateStaking *DelegateStakingTransactorSession) ReleasePoolHolds(hot_ common.Address, iterations_ uint8) (*types.Transaction, error) {
	return _DelegateStaking.Contract.ReleasePoolHolds(&_DelegateStaking.TransactOpts, hot_, iterations_)
}

// RevokeStakingAllowance is a paid mutator transaction binding the contract method 0x6a81e054.
//
// Solidity: function revokeStakingAllowance(address hot_) returns()
func (_DelegateStaking *DelegateStakingTransactor) RevokeStakingAllowance(opts *bind.TransactOpts, hot_ common.Address) (*types.Transaction, error) {
	return _DelegateStaking.contract.Transact(opts, "revokeStakingAllowance", hot_)
}

// RevokeStakingAllowance is a paid mutator transaction binding the contract method 0x6a81e054.
//
// Solidity: function revokeStakingAllowance(address hot_) returns()
func (_DelegateStaking *DelegateStakingSession) RevokeStakingAllowance(hot_ common.Address) (*types.Transaction, error) {
	return _DelegateStaking.Contract.RevokeStakingAllowance(&_DelegateStaking.TransactOpts, hot_)
}

// RevokeStakingAllowance is a paid mutator transaction binding the contract method 0x6a81e054.
//
// Solidity: function revokeStakingAllowance(address hot_) returns()
func (_DelegateStaking *DelegateStakingTransactorSession) RevokeStakingAllowance(hot_ common.Address) (*types.Transaction, error) {
	return _DelegateStaking.Contract.RevokeStakingAllowance(&_DelegateStaking.TransactOpts, hot_)
}

// SetDelegateStakingParams is a paid mutator transaction binding the contract method 0x34cf19fd.
//
// Solidity: function setDelegateStakingParams((uint256,uint256,uint256,uint256,uint256) params_) returns()
func (_DelegateStaking *DelegateStakingTransactor) SetDelegateStakingParams(opts *bind.TransactOpts, params_ IDelegateStakingCoreDelegateStakingParams) (*types.Transaction, error) {
	return _DelegateStaking.contract.Transact(opts, "setDelegateStakingParams", params_)
}

// SetDelegateStakingParams is a paid mutator transaction binding the contract method 0x34cf19fd.
//
// Solidity: function setDelegateStakingParams((uint256,uint256,uint256,uint256,uint256) params_) returns()
func (_DelegateStaking *DelegateStakingSession) SetDelegateStakingParams(params_ IDelegateStakingCoreDelegateStakingParams) (*types.Transaction, error) {
	return _DelegateStaking.Contract.SetDelegateStakingParams(&_DelegateStaking.TransactOpts, params_)
}

// SetDelegateStakingParams is a paid mutator transaction binding the contract method 0x34cf19fd.
//
// Solidity: function setDelegateStakingParams((uint256,uint256,uint256,uint256,uint256) params_) returns()
func (_DelegateStaking *DelegateStakingTransactorSession) SetDelegateStakingParams(params_ IDelegateStakingCoreDelegateStakingParams) (*types.Transaction, error) {
	return _DelegateStaking.Contract.SetDelegateStakingParams(&_DelegateStaking.TransactOpts, params_)
}

// WithdrawStakingAllowance is a paid mutator transaction binding the contract method 0xc96cda18.
//
// Solidity: function withdrawStakingAllowance(address hot_, uint256 amount_) returns()
func (_DelegateStaking *DelegateStakingTransactor) WithdrawStakingAllowance(opts *bind.TransactOpts, hot_ common.Address, amount_ *big.Int) (*types.Transaction, error) {
	return _DelegateStaking.contract.Transact(opts, "withdrawStakingAllowance", hot_, amount_)
}

// WithdrawStakingAllowance is a paid mutator transaction binding the contract method 0xc96cda18.
//
// Solidity: function withdrawStakingAllowance(address hot_, uint256 amount_) returns()
func (_DelegateStaking *DelegateStakingSession) WithdrawStakingAllowance(hot_ common.Address, amount_ *big.Int) (*types.Transaction, error) {
	return _DelegateStaking.Contract.WithdrawStakingAllowance(&_DelegateStaking.TransactOpts, hot_, amount_)
}

// WithdrawStakingAllowance is a paid mutator transaction binding the contract method 0xc96cda18.
//
// Solidity: function withdrawStakingAllowance(address hot_, uint256 amount_) returns()
func (_DelegateStaking *DelegateStakingTransactorSession) WithdrawStakingAllowance(hot_ common.Address, amount_ *big.Int) (*types.Transaction, error) {
	return _DelegateStaking.Contract.WithdrawStakingAllowance(&_DelegateStaking.TransactOpts, hot_, amount_)
}

// DelegateStakingAllowanceDebitedIterator is returned from FilterAllowanceDebited and is used to iterate over the raw logs and unpacked data for AllowanceDebited events raised by the DelegateStaking contract.
type DelegateStakingAllowanceDebitedIterator struct {
	Event *DelegateStakingAllowanceDebited // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *DelegateStakingAllowanceDebitedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(DelegateStakingAllowanceDebited)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(DelegateStakingAllowanceDebited)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *DelegateStakingAllowanceDebitedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *DelegateStakingAllowanceDebitedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// DelegateStakingAllowanceDebited represents a AllowanceDebited event raised by the DelegateStaking contract.
type DelegateStakingAllowanceDebited struct {
	Hot       common.Address
	Funder    common.Address
	Amount    *big.Int
	SessionId [32]byte
	Raw       types.Log // Blockchain specific contextual infos
}

// FilterAllowanceDebited is a free log retrieval operation binding the contract event 0x005d5f17c7d38039e5043c6d5ee5a520ec9bf8dc6440e8aa14d9a0fc7c5e9989.
//
// Solidity: event AllowanceDebited(address indexed hot, address indexed funder, uint256 amount, bytes32 indexed sessionId)
func (_DelegateStaking *DelegateStakingFilterer) FilterAllowanceDebited(opts *bind.FilterOpts, hot []common.Address, funder []common.Address, sessionId [][32]byte) (*DelegateStakingAllowanceDebitedIterator, error) {

	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}
	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}

	var sessionIdRule []interface{}
	for _, sessionIdItem := range sessionId {
		sessionIdRule = append(sessionIdRule, sessionIdItem)
	}

	logs, sub, err := _DelegateStaking.contract.FilterLogs(opts, "AllowanceDebited", hotRule, funderRule, sessionIdRule)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingAllowanceDebitedIterator{contract: _DelegateStaking.contract, event: "AllowanceDebited", logs: logs, sub: sub}, nil
}

// WatchAllowanceDebited is a free log subscription operation binding the contract event 0x005d5f17c7d38039e5043c6d5ee5a520ec9bf8dc6440e8aa14d9a0fc7c5e9989.
//
// Solidity: event AllowanceDebited(address indexed hot, address indexed funder, uint256 amount, bytes32 indexed sessionId)
func (_DelegateStaking *DelegateStakingFilterer) WatchAllowanceDebited(opts *bind.WatchOpts, sink chan<- *DelegateStakingAllowanceDebited, hot []common.Address, funder []common.Address, sessionId [][32]byte) (event.Subscription, error) {

	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}
	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}

	var sessionIdRule []interface{}
	for _, sessionIdItem := range sessionId {
		sessionIdRule = append(sessionIdRule, sessionIdItem)
	}

	logs, sub, err := _DelegateStaking.contract.WatchLogs(opts, "AllowanceDebited", hotRule, funderRule, sessionIdRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(DelegateStakingAllowanceDebited)
				if err := _DelegateStaking.contract.UnpackLog(event, "AllowanceDebited", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseAllowanceDebited is a log parse operation binding the contract event 0x005d5f17c7d38039e5043c6d5ee5a520ec9bf8dc6440e8aa14d9a0fc7c5e9989.
//
// Solidity: event AllowanceDebited(address indexed hot, address indexed funder, uint256 amount, bytes32 indexed sessionId)
func (_DelegateStaking *DelegateStakingFilterer) ParseAllowanceDebited(log types.Log) (*DelegateStakingAllowanceDebited, error) {
	event := new(DelegateStakingAllowanceDebited)
	if err := _DelegateStaking.contract.UnpackLog(event, "AllowanceDebited", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// DelegateStakingAllowanceHoldCreatedIterator is returned from FilterAllowanceHoldCreated and is used to iterate over the raw logs and unpacked data for AllowanceHoldCreated events raised by the DelegateStaking contract.
type DelegateStakingAllowanceHoldCreatedIterator struct {
	Event *DelegateStakingAllowanceHoldCreated // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *DelegateStakingAllowanceHoldCreatedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(DelegateStakingAllowanceHoldCreated)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(DelegateStakingAllowanceHoldCreated)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *DelegateStakingAllowanceHoldCreatedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *DelegateStakingAllowanceHoldCreatedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// DelegateStakingAllowanceHoldCreated represents a AllowanceHoldCreated event raised by the DelegateStaking contract.
type DelegateStakingAllowanceHoldCreated struct {
	Hot       common.Address
	Funder    common.Address
	Amount    *big.Int
	ReleaseAt *big.Int
	Raw       types.Log // Blockchain specific contextual infos
}

// FilterAllowanceHoldCreated is a free log retrieval operation binding the contract event 0x616161e42bb5a3abea7a54bfb85592517b4fb7788426131bc8ae6214fbcd4e24.
//
// Solidity: event AllowanceHoldCreated(address indexed hot, address indexed funder, uint256 amount, uint128 releaseAt)
func (_DelegateStaking *DelegateStakingFilterer) FilterAllowanceHoldCreated(opts *bind.FilterOpts, hot []common.Address, funder []common.Address) (*DelegateStakingAllowanceHoldCreatedIterator, error) {

	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}
	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}

	logs, sub, err := _DelegateStaking.contract.FilterLogs(opts, "AllowanceHoldCreated", hotRule, funderRule)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingAllowanceHoldCreatedIterator{contract: _DelegateStaking.contract, event: "AllowanceHoldCreated", logs: logs, sub: sub}, nil
}

// WatchAllowanceHoldCreated is a free log subscription operation binding the contract event 0x616161e42bb5a3abea7a54bfb85592517b4fb7788426131bc8ae6214fbcd4e24.
//
// Solidity: event AllowanceHoldCreated(address indexed hot, address indexed funder, uint256 amount, uint128 releaseAt)
func (_DelegateStaking *DelegateStakingFilterer) WatchAllowanceHoldCreated(opts *bind.WatchOpts, sink chan<- *DelegateStakingAllowanceHoldCreated, hot []common.Address, funder []common.Address) (event.Subscription, error) {

	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}
	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}

	logs, sub, err := _DelegateStaking.contract.WatchLogs(opts, "AllowanceHoldCreated", hotRule, funderRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(DelegateStakingAllowanceHoldCreated)
				if err := _DelegateStaking.contract.UnpackLog(event, "AllowanceHoldCreated", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseAllowanceHoldCreated is a log parse operation binding the contract event 0x616161e42bb5a3abea7a54bfb85592517b4fb7788426131bc8ae6214fbcd4e24.
//
// Solidity: event AllowanceHoldCreated(address indexed hot, address indexed funder, uint256 amount, uint128 releaseAt)
func (_DelegateStaking *DelegateStakingFilterer) ParseAllowanceHoldCreated(log types.Log) (*DelegateStakingAllowanceHoldCreated, error) {
	event := new(DelegateStakingAllowanceHoldCreated)
	if err := _DelegateStaking.contract.UnpackLog(event, "AllowanceHoldCreated", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// DelegateStakingAllowanceReleasedIterator is returned from FilterAllowanceReleased and is used to iterate over the raw logs and unpacked data for AllowanceReleased events raised by the DelegateStaking contract.
type DelegateStakingAllowanceReleasedIterator struct {
	Event *DelegateStakingAllowanceReleased // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *DelegateStakingAllowanceReleasedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(DelegateStakingAllowanceReleased)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(DelegateStakingAllowanceReleased)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *DelegateStakingAllowanceReleasedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *DelegateStakingAllowanceReleasedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// DelegateStakingAllowanceReleased represents a AllowanceReleased event raised by the DelegateStaking contract.
type DelegateStakingAllowanceReleased struct {
	Hot    common.Address
	Funder common.Address
	Amount *big.Int
	Raw    types.Log // Blockchain specific contextual infos
}

// FilterAllowanceReleased is a free log retrieval operation binding the contract event 0xf2b1f52a7523559d77812c3cecfde5f41c01f219bd6e128f4a4f6bcea1f3d0d2.
//
// Solidity: event AllowanceReleased(address indexed hot, address indexed funder, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) FilterAllowanceReleased(opts *bind.FilterOpts, hot []common.Address, funder []common.Address) (*DelegateStakingAllowanceReleasedIterator, error) {

	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}
	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}

	logs, sub, err := _DelegateStaking.contract.FilterLogs(opts, "AllowanceReleased", hotRule, funderRule)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingAllowanceReleasedIterator{contract: _DelegateStaking.contract, event: "AllowanceReleased", logs: logs, sub: sub}, nil
}

// WatchAllowanceReleased is a free log subscription operation binding the contract event 0xf2b1f52a7523559d77812c3cecfde5f41c01f219bd6e128f4a4f6bcea1f3d0d2.
//
// Solidity: event AllowanceReleased(address indexed hot, address indexed funder, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) WatchAllowanceReleased(opts *bind.WatchOpts, sink chan<- *DelegateStakingAllowanceReleased, hot []common.Address, funder []common.Address) (event.Subscription, error) {

	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}
	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}

	logs, sub, err := _DelegateStaking.contract.WatchLogs(opts, "AllowanceReleased", hotRule, funderRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(DelegateStakingAllowanceReleased)
				if err := _DelegateStaking.contract.UnpackLog(event, "AllowanceReleased", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseAllowanceReleased is a log parse operation binding the contract event 0xf2b1f52a7523559d77812c3cecfde5f41c01f219bd6e128f4a4f6bcea1f3d0d2.
//
// Solidity: event AllowanceReleased(address indexed hot, address indexed funder, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) ParseAllowanceReleased(log types.Log) (*DelegateStakingAllowanceReleased, error) {
	event := new(DelegateStakingAllowanceReleased)
	if err := _DelegateStaking.contract.UnpackLog(event, "AllowanceReleased", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// DelegateStakingAllowanceWithdrawQueuedIterator is returned from FilterAllowanceWithdrawQueued and is used to iterate over the raw logs and unpacked data for AllowanceWithdrawQueued events raised by the DelegateStaking contract.
type DelegateStakingAllowanceWithdrawQueuedIterator struct {
	Event *DelegateStakingAllowanceWithdrawQueued // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *DelegateStakingAllowanceWithdrawQueuedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(DelegateStakingAllowanceWithdrawQueued)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(DelegateStakingAllowanceWithdrawQueued)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *DelegateStakingAllowanceWithdrawQueuedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *DelegateStakingAllowanceWithdrawQueuedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// DelegateStakingAllowanceWithdrawQueued represents a AllowanceWithdrawQueued event raised by the DelegateStaking contract.
type DelegateStakingAllowanceWithdrawQueued struct {
	Funder common.Address
	Hot    common.Address
	Amount *big.Int
	Raw    types.Log // Blockchain specific contextual infos
}

// FilterAllowanceWithdrawQueued is a free log retrieval operation binding the contract event 0x602b71210b359c76b6ebf4855f4e06e0a51e170b5468ff033182c9e3524c404b.
//
// Solidity: event AllowanceWithdrawQueued(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) FilterAllowanceWithdrawQueued(opts *bind.FilterOpts, funder []common.Address, hot []common.Address) (*DelegateStakingAllowanceWithdrawQueuedIterator, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.FilterLogs(opts, "AllowanceWithdrawQueued", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingAllowanceWithdrawQueuedIterator{contract: _DelegateStaking.contract, event: "AllowanceWithdrawQueued", logs: logs, sub: sub}, nil
}

// WatchAllowanceWithdrawQueued is a free log subscription operation binding the contract event 0x602b71210b359c76b6ebf4855f4e06e0a51e170b5468ff033182c9e3524c404b.
//
// Solidity: event AllowanceWithdrawQueued(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) WatchAllowanceWithdrawQueued(opts *bind.WatchOpts, sink chan<- *DelegateStakingAllowanceWithdrawQueued, funder []common.Address, hot []common.Address) (event.Subscription, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.WatchLogs(opts, "AllowanceWithdrawQueued", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(DelegateStakingAllowanceWithdrawQueued)
				if err := _DelegateStaking.contract.UnpackLog(event, "AllowanceWithdrawQueued", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseAllowanceWithdrawQueued is a log parse operation binding the contract event 0x602b71210b359c76b6ebf4855f4e06e0a51e170b5468ff033182c9e3524c404b.
//
// Solidity: event AllowanceWithdrawQueued(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) ParseAllowanceWithdrawQueued(log types.Log) (*DelegateStakingAllowanceWithdrawQueued, error) {
	event := new(DelegateStakingAllowanceWithdrawQueued)
	if err := _DelegateStaking.contract.UnpackLog(event, "AllowanceWithdrawQueued", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// DelegateStakingAllowanceWithdrawnIterator is returned from FilterAllowanceWithdrawn and is used to iterate over the raw logs and unpacked data for AllowanceWithdrawn events raised by the DelegateStaking contract.
type DelegateStakingAllowanceWithdrawnIterator struct {
	Event *DelegateStakingAllowanceWithdrawn // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *DelegateStakingAllowanceWithdrawnIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(DelegateStakingAllowanceWithdrawn)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(DelegateStakingAllowanceWithdrawn)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *DelegateStakingAllowanceWithdrawnIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *DelegateStakingAllowanceWithdrawnIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// DelegateStakingAllowanceWithdrawn represents a AllowanceWithdrawn event raised by the DelegateStaking contract.
type DelegateStakingAllowanceWithdrawn struct {
	Funder common.Address
	Hot    common.Address
	Amount *big.Int
	Raw    types.Log // Blockchain specific contextual infos
}

// FilterAllowanceWithdrawn is a free log retrieval operation binding the contract event 0xca13d6a604110950505d5d76ef25e820785641edd459ef25b69a3d69ca648db3.
//
// Solidity: event AllowanceWithdrawn(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) FilterAllowanceWithdrawn(opts *bind.FilterOpts, funder []common.Address, hot []common.Address) (*DelegateStakingAllowanceWithdrawnIterator, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.FilterLogs(opts, "AllowanceWithdrawn", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingAllowanceWithdrawnIterator{contract: _DelegateStaking.contract, event: "AllowanceWithdrawn", logs: logs, sub: sub}, nil
}

// WatchAllowanceWithdrawn is a free log subscription operation binding the contract event 0xca13d6a604110950505d5d76ef25e820785641edd459ef25b69a3d69ca648db3.
//
// Solidity: event AllowanceWithdrawn(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) WatchAllowanceWithdrawn(opts *bind.WatchOpts, sink chan<- *DelegateStakingAllowanceWithdrawn, funder []common.Address, hot []common.Address) (event.Subscription, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.WatchLogs(opts, "AllowanceWithdrawn", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(DelegateStakingAllowanceWithdrawn)
				if err := _DelegateStaking.contract.UnpackLog(event, "AllowanceWithdrawn", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseAllowanceWithdrawn is a log parse operation binding the contract event 0xca13d6a604110950505d5d76ef25e820785641edd459ef25b69a3d69ca648db3.
//
// Solidity: event AllowanceWithdrawn(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) ParseAllowanceWithdrawn(log types.Log) (*DelegateStakingAllowanceWithdrawn, error) {
	event := new(DelegateStakingAllowanceWithdrawn)
	if err := _DelegateStaking.contract.UnpackLog(event, "AllowanceWithdrawn", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// DelegateStakingDelegateStakingParamsUpdatedIterator is returned from FilterDelegateStakingParamsUpdated and is used to iterate over the raw logs and unpacked data for DelegateStakingParamsUpdated events raised by the DelegateStaking contract.
type DelegateStakingDelegateStakingParamsUpdatedIterator struct {
	Event *DelegateStakingDelegateStakingParamsUpdated // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *DelegateStakingDelegateStakingParamsUpdatedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(DelegateStakingDelegateStakingParamsUpdated)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(DelegateStakingDelegateStakingParamsUpdated)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *DelegateStakingDelegateStakingParamsUpdatedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *DelegateStakingDelegateStakingParamsUpdatedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// DelegateStakingDelegateStakingParamsUpdated represents a DelegateStakingParamsUpdated event raised by the DelegateStaking contract.
type DelegateStakingDelegateStakingParamsUpdated struct {
	MinPrincipal       *big.Int
	MaxActiveFunders   *big.Int
	MaxAutoService     *big.Int
	MaxAutoReleaseDays *big.Int
	SettlementGrace    *big.Int
	Raw                types.Log // Blockchain specific contextual infos
}

// FilterDelegateStakingParamsUpdated is a free log retrieval operation binding the contract event 0x996f7784413c0843b89e0d3d4211ca4d50b7450f4d68e3b8fd22363bc4b1445a.
//
// Solidity: event DelegateStakingParamsUpdated(uint256 minPrincipal, uint256 maxActiveFunders, uint256 maxAutoService, uint256 maxAutoReleaseDays, uint256 settlementGrace)
func (_DelegateStaking *DelegateStakingFilterer) FilterDelegateStakingParamsUpdated(opts *bind.FilterOpts) (*DelegateStakingDelegateStakingParamsUpdatedIterator, error) {

	logs, sub, err := _DelegateStaking.contract.FilterLogs(opts, "DelegateStakingParamsUpdated")
	if err != nil {
		return nil, err
	}
	return &DelegateStakingDelegateStakingParamsUpdatedIterator{contract: _DelegateStaking.contract, event: "DelegateStakingParamsUpdated", logs: logs, sub: sub}, nil
}

// WatchDelegateStakingParamsUpdated is a free log subscription operation binding the contract event 0x996f7784413c0843b89e0d3d4211ca4d50b7450f4d68e3b8fd22363bc4b1445a.
//
// Solidity: event DelegateStakingParamsUpdated(uint256 minPrincipal, uint256 maxActiveFunders, uint256 maxAutoService, uint256 maxAutoReleaseDays, uint256 settlementGrace)
func (_DelegateStaking *DelegateStakingFilterer) WatchDelegateStakingParamsUpdated(opts *bind.WatchOpts, sink chan<- *DelegateStakingDelegateStakingParamsUpdated) (event.Subscription, error) {

	logs, sub, err := _DelegateStaking.contract.WatchLogs(opts, "DelegateStakingParamsUpdated")
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(DelegateStakingDelegateStakingParamsUpdated)
				if err := _DelegateStaking.contract.UnpackLog(event, "DelegateStakingParamsUpdated", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseDelegateStakingParamsUpdated is a log parse operation binding the contract event 0x996f7784413c0843b89e0d3d4211ca4d50b7450f4d68e3b8fd22363bc4b1445a.
//
// Solidity: event DelegateStakingParamsUpdated(uint256 minPrincipal, uint256 maxActiveFunders, uint256 maxAutoService, uint256 maxAutoReleaseDays, uint256 settlementGrace)
func (_DelegateStaking *DelegateStakingFilterer) ParseDelegateStakingParamsUpdated(log types.Log) (*DelegateStakingDelegateStakingParamsUpdated, error) {
	event := new(DelegateStakingDelegateStakingParamsUpdated)
	if err := _DelegateStaking.contract.UnpackLog(event, "DelegateStakingParamsUpdated", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// DelegateStakingInitializedIterator is returned from FilterInitialized and is used to iterate over the raw logs and unpacked data for Initialized events raised by the DelegateStaking contract.
type DelegateStakingInitializedIterator struct {
	Event *DelegateStakingInitialized // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *DelegateStakingInitializedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(DelegateStakingInitialized)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(DelegateStakingInitialized)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *DelegateStakingInitializedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *DelegateStakingInitializedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// DelegateStakingInitialized represents a Initialized event raised by the DelegateStaking contract.
type DelegateStakingInitialized struct {
	StorageSlot [32]byte
	Raw         types.Log // Blockchain specific contextual infos
}

// FilterInitialized is a free log retrieval operation binding the contract event 0xdc73717d728bcfa015e8117438a65319aa06e979ca324afa6e1ea645c28ea15d.
//
// Solidity: event Initialized(bytes32 storageSlot)
func (_DelegateStaking *DelegateStakingFilterer) FilterInitialized(opts *bind.FilterOpts) (*DelegateStakingInitializedIterator, error) {

	logs, sub, err := _DelegateStaking.contract.FilterLogs(opts, "Initialized")
	if err != nil {
		return nil, err
	}
	return &DelegateStakingInitializedIterator{contract: _DelegateStaking.contract, event: "Initialized", logs: logs, sub: sub}, nil
}

// WatchInitialized is a free log subscription operation binding the contract event 0xdc73717d728bcfa015e8117438a65319aa06e979ca324afa6e1ea645c28ea15d.
//
// Solidity: event Initialized(bytes32 storageSlot)
func (_DelegateStaking *DelegateStakingFilterer) WatchInitialized(opts *bind.WatchOpts, sink chan<- *DelegateStakingInitialized) (event.Subscription, error) {

	logs, sub, err := _DelegateStaking.contract.WatchLogs(opts, "Initialized")
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(DelegateStakingInitialized)
				if err := _DelegateStaking.contract.UnpackLog(event, "Initialized", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseInitialized is a log parse operation binding the contract event 0xdc73717d728bcfa015e8117438a65319aa06e979ca324afa6e1ea645c28ea15d.
//
// Solidity: event Initialized(bytes32 storageSlot)
func (_DelegateStaking *DelegateStakingFilterer) ParseInitialized(log types.Log) (*DelegateStakingInitialized, error) {
	event := new(DelegateStakingInitialized)
	if err := _DelegateStaking.contract.UnpackLog(event, "Initialized", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// DelegateStakingPendingWithdrawalPaidIterator is returned from FilterPendingWithdrawalPaid and is used to iterate over the raw logs and unpacked data for PendingWithdrawalPaid events raised by the DelegateStaking contract.
type DelegateStakingPendingWithdrawalPaidIterator struct {
	Event *DelegateStakingPendingWithdrawalPaid // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *DelegateStakingPendingWithdrawalPaidIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(DelegateStakingPendingWithdrawalPaid)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(DelegateStakingPendingWithdrawalPaid)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *DelegateStakingPendingWithdrawalPaidIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *DelegateStakingPendingWithdrawalPaidIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// DelegateStakingPendingWithdrawalPaid represents a PendingWithdrawalPaid event raised by the DelegateStaking contract.
type DelegateStakingPendingWithdrawalPaid struct {
	Funder common.Address
	Hot    common.Address
	Amount *big.Int
	Raw    types.Log // Blockchain specific contextual infos
}

// FilterPendingWithdrawalPaid is a free log retrieval operation binding the contract event 0xe6aad6052eabed5692a880d6df2cfb242532fdbc7caa99a818138a6dd8b3ce66.
//
// Solidity: event PendingWithdrawalPaid(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) FilterPendingWithdrawalPaid(opts *bind.FilterOpts, funder []common.Address, hot []common.Address) (*DelegateStakingPendingWithdrawalPaidIterator, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.FilterLogs(opts, "PendingWithdrawalPaid", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingPendingWithdrawalPaidIterator{contract: _DelegateStaking.contract, event: "PendingWithdrawalPaid", logs: logs, sub: sub}, nil
}

// WatchPendingWithdrawalPaid is a free log subscription operation binding the contract event 0xe6aad6052eabed5692a880d6df2cfb242532fdbc7caa99a818138a6dd8b3ce66.
//
// Solidity: event PendingWithdrawalPaid(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) WatchPendingWithdrawalPaid(opts *bind.WatchOpts, sink chan<- *DelegateStakingPendingWithdrawalPaid, funder []common.Address, hot []common.Address) (event.Subscription, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.WatchLogs(opts, "PendingWithdrawalPaid", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(DelegateStakingPendingWithdrawalPaid)
				if err := _DelegateStaking.contract.UnpackLog(event, "PendingWithdrawalPaid", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParsePendingWithdrawalPaid is a log parse operation binding the contract event 0xe6aad6052eabed5692a880d6df2cfb242532fdbc7caa99a818138a6dd8b3ce66.
//
// Solidity: event PendingWithdrawalPaid(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) ParsePendingWithdrawalPaid(log types.Log) (*DelegateStakingPendingWithdrawalPaid, error) {
	event := new(DelegateStakingPendingWithdrawalPaid)
	if err := _DelegateStaking.contract.UnpackLog(event, "PendingWithdrawalPaid", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// DelegateStakingStakingAllowanceFundedIterator is returned from FilterStakingAllowanceFunded and is used to iterate over the raw logs and unpacked data for StakingAllowanceFunded events raised by the DelegateStaking contract.
type DelegateStakingStakingAllowanceFundedIterator struct {
	Event *DelegateStakingStakingAllowanceFunded // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *DelegateStakingStakingAllowanceFundedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(DelegateStakingStakingAllowanceFunded)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(DelegateStakingStakingAllowanceFunded)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *DelegateStakingStakingAllowanceFundedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *DelegateStakingStakingAllowanceFundedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// DelegateStakingStakingAllowanceFunded represents a StakingAllowanceFunded event raised by the DelegateStaking contract.
type DelegateStakingStakingAllowanceFunded struct {
	Funder common.Address
	Hot    common.Address
	Amount *big.Int
	Raw    types.Log // Blockchain specific contextual infos
}

// FilterStakingAllowanceFunded is a free log retrieval operation binding the contract event 0x9961efb9eb5578cb5221db6ab9b32e0fa0c228a1c48a099a9cb0e1bbc0ffb9cf.
//
// Solidity: event StakingAllowanceFunded(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) FilterStakingAllowanceFunded(opts *bind.FilterOpts, funder []common.Address, hot []common.Address) (*DelegateStakingStakingAllowanceFundedIterator, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.FilterLogs(opts, "StakingAllowanceFunded", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingStakingAllowanceFundedIterator{contract: _DelegateStaking.contract, event: "StakingAllowanceFunded", logs: logs, sub: sub}, nil
}

// WatchStakingAllowanceFunded is a free log subscription operation binding the contract event 0x9961efb9eb5578cb5221db6ab9b32e0fa0c228a1c48a099a9cb0e1bbc0ffb9cf.
//
// Solidity: event StakingAllowanceFunded(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) WatchStakingAllowanceFunded(opts *bind.WatchOpts, sink chan<- *DelegateStakingStakingAllowanceFunded, funder []common.Address, hot []common.Address) (event.Subscription, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.WatchLogs(opts, "StakingAllowanceFunded", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(DelegateStakingStakingAllowanceFunded)
				if err := _DelegateStaking.contract.UnpackLog(event, "StakingAllowanceFunded", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseStakingAllowanceFunded is a log parse operation binding the contract event 0x9961efb9eb5578cb5221db6ab9b32e0fa0c228a1c48a099a9cb0e1bbc0ffb9cf.
//
// Solidity: event StakingAllowanceFunded(address indexed funder, address indexed hot, uint256 amount)
func (_DelegateStaking *DelegateStakingFilterer) ParseStakingAllowanceFunded(log types.Log) (*DelegateStakingStakingAllowanceFunded, error) {
	event := new(DelegateStakingStakingAllowanceFunded)
	if err := _DelegateStaking.contract.UnpackLog(event, "StakingAllowanceFunded", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// DelegateStakingStakingAllowanceGrantedIterator is returned from FilterStakingAllowanceGranted and is used to iterate over the raw logs and unpacked data for StakingAllowanceGranted events raised by the DelegateStaking contract.
type DelegateStakingStakingAllowanceGrantedIterator struct {
	Event *DelegateStakingStakingAllowanceGranted // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *DelegateStakingStakingAllowanceGrantedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(DelegateStakingStakingAllowanceGranted)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(DelegateStakingStakingAllowanceGranted)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *DelegateStakingStakingAllowanceGrantedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *DelegateStakingStakingAllowanceGrantedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// DelegateStakingStakingAllowanceGranted represents a StakingAllowanceGranted event raised by the DelegateStaking contract.
type DelegateStakingStakingAllowanceGranted struct {
	Funder               common.Address
	Hot                  common.Address
	CumulativeFundingCap *big.Int
	Expiry               *big.Int
	Raw                  types.Log // Blockchain specific contextual infos
}

// FilterStakingAllowanceGranted is a free log retrieval operation binding the contract event 0x3aa047f40a56a8f90a0363fd2daede670681c2a6c746b0abd8ceb822e7aa2ba9.
//
// Solidity: event StakingAllowanceGranted(address indexed funder, address indexed hot, uint256 cumulativeFundingCap, uint128 expiry)
func (_DelegateStaking *DelegateStakingFilterer) FilterStakingAllowanceGranted(opts *bind.FilterOpts, funder []common.Address, hot []common.Address) (*DelegateStakingStakingAllowanceGrantedIterator, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.FilterLogs(opts, "StakingAllowanceGranted", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingStakingAllowanceGrantedIterator{contract: _DelegateStaking.contract, event: "StakingAllowanceGranted", logs: logs, sub: sub}, nil
}

// WatchStakingAllowanceGranted is a free log subscription operation binding the contract event 0x3aa047f40a56a8f90a0363fd2daede670681c2a6c746b0abd8ceb822e7aa2ba9.
//
// Solidity: event StakingAllowanceGranted(address indexed funder, address indexed hot, uint256 cumulativeFundingCap, uint128 expiry)
func (_DelegateStaking *DelegateStakingFilterer) WatchStakingAllowanceGranted(opts *bind.WatchOpts, sink chan<- *DelegateStakingStakingAllowanceGranted, funder []common.Address, hot []common.Address) (event.Subscription, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.WatchLogs(opts, "StakingAllowanceGranted", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(DelegateStakingStakingAllowanceGranted)
				if err := _DelegateStaking.contract.UnpackLog(event, "StakingAllowanceGranted", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseStakingAllowanceGranted is a log parse operation binding the contract event 0x3aa047f40a56a8f90a0363fd2daede670681c2a6c746b0abd8ceb822e7aa2ba9.
//
// Solidity: event StakingAllowanceGranted(address indexed funder, address indexed hot, uint256 cumulativeFundingCap, uint128 expiry)
func (_DelegateStaking *DelegateStakingFilterer) ParseStakingAllowanceGranted(log types.Log) (*DelegateStakingStakingAllowanceGranted, error) {
	event := new(DelegateStakingStakingAllowanceGranted)
	if err := _DelegateStaking.contract.UnpackLog(event, "StakingAllowanceGranted", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// DelegateStakingStakingAllowanceRevokedIterator is returned from FilterStakingAllowanceRevoked and is used to iterate over the raw logs and unpacked data for StakingAllowanceRevoked events raised by the DelegateStaking contract.
type DelegateStakingStakingAllowanceRevokedIterator struct {
	Event *DelegateStakingStakingAllowanceRevoked // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *DelegateStakingStakingAllowanceRevokedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(DelegateStakingStakingAllowanceRevoked)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(DelegateStakingStakingAllowanceRevoked)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *DelegateStakingStakingAllowanceRevokedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *DelegateStakingStakingAllowanceRevokedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// DelegateStakingStakingAllowanceRevoked represents a StakingAllowanceRevoked event raised by the DelegateStaking contract.
type DelegateStakingStakingAllowanceRevoked struct {
	Funder common.Address
	Hot    common.Address
	Raw    types.Log // Blockchain specific contextual infos
}

// FilterStakingAllowanceRevoked is a free log retrieval operation binding the contract event 0x76fc8da59fc7b37da99fae44440bf809557bb38547617a33fcddc3c7721696c0.
//
// Solidity: event StakingAllowanceRevoked(address indexed funder, address indexed hot)
func (_DelegateStaking *DelegateStakingFilterer) FilterStakingAllowanceRevoked(opts *bind.FilterOpts, funder []common.Address, hot []common.Address) (*DelegateStakingStakingAllowanceRevokedIterator, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.FilterLogs(opts, "StakingAllowanceRevoked", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return &DelegateStakingStakingAllowanceRevokedIterator{contract: _DelegateStaking.contract, event: "StakingAllowanceRevoked", logs: logs, sub: sub}, nil
}

// WatchStakingAllowanceRevoked is a free log subscription operation binding the contract event 0x76fc8da59fc7b37da99fae44440bf809557bb38547617a33fcddc3c7721696c0.
//
// Solidity: event StakingAllowanceRevoked(address indexed funder, address indexed hot)
func (_DelegateStaking *DelegateStakingFilterer) WatchStakingAllowanceRevoked(opts *bind.WatchOpts, sink chan<- *DelegateStakingStakingAllowanceRevoked, funder []common.Address, hot []common.Address) (event.Subscription, error) {

	var funderRule []interface{}
	for _, funderItem := range funder {
		funderRule = append(funderRule, funderItem)
	}
	var hotRule []interface{}
	for _, hotItem := range hot {
		hotRule = append(hotRule, hotItem)
	}

	logs, sub, err := _DelegateStaking.contract.WatchLogs(opts, "StakingAllowanceRevoked", funderRule, hotRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(DelegateStakingStakingAllowanceRevoked)
				if err := _DelegateStaking.contract.UnpackLog(event, "StakingAllowanceRevoked", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseStakingAllowanceRevoked is a log parse operation binding the contract event 0x76fc8da59fc7b37da99fae44440bf809557bb38547617a33fcddc3c7721696c0.
//
// Solidity: event StakingAllowanceRevoked(address indexed funder, address indexed hot)
func (_DelegateStaking *DelegateStakingFilterer) ParseStakingAllowanceRevoked(log types.Log) (*DelegateStakingStakingAllowanceRevoked, error) {
	event := new(DelegateStakingStakingAllowanceRevoked)
	if err := _DelegateStaking.contract.UnpackLog(event, "StakingAllowanceRevoked", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}
