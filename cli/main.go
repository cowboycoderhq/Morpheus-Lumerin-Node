package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/big"
	"os"
	"strings"
	"time"

	chat "github.com/MorpheusAIs/Morpheus-Lumerin-Node/cli/chat"
	"github.com/MorpheusAIs/Morpheus-Lumerin-Node/cli/chat/client"
	chatCommon "github.com/MorpheusAIs/Morpheus-Lumerin-Node/cli/chat/common"
	"github.com/ethereum/go-ethereum/common"

	"github.com/urfave/cli/v2"
)

const httpErrorMessage string = "internal error: %v; http status: %v"

func main() {

	apiClient, err := client.NewApiGatewayClientFromEnv(os.Getenv)
	if err != nil {
		log.Fatal(err)
	}

	actions := NewActions(apiClient)
	app := &cli.App{
		Usage: "A client to call the Morpheus Lumerin API",
		Commands: []*cli.Command{
			{
				Name:    "healthcheck",
				Aliases: []string{"he"},
				Usage:   "morpheus healthcheck",
				Action:  actions.healthcheck,
			},
			{
				Name:    "wallet",
				Aliases: []string{"w"},
				Usage:   "morpheus wallet",
				Action:  actions.getWallet,
				Subcommands: []*cli.Command{
					{
						Name:    "create",
						Aliases: []string{"c"},
						Usage:   "morpheus wallet create --privateKey <private-key>",
						Action:  actions.setupWallet,

						Flags: []cli.Flag{
							&cli.StringFlag{
								Name:     "privateKey",
								Required: true,
							},
						},
					},
					{
						Name:    "balance",
						Aliases: []string{"b"},
						Usage:   "morpheus wallet balance",
						Action:  actions.getBalance,
					},
				},
			},

			{
				Name:    "chat-local",
				Aliases: []string{"cl"},
				Usage:   "Chat with local model",
				Action:  actions.startChatLocal,
				Flags: []cli.Flag{
					cli.HelpFlag,
				},
			},
			{
				Name:    "chat",
				Aliases: []string{"c"},
				Usage:   "Chat with remote model through session",
				Action:  actions.startRemoteChat,
				Flags: []cli.Flag{
					cli.HelpFlag,
					&cli.StringFlag{
						Name:     "session",
						Required: false,
					},
				},
			},
			{
				Name:    "listBlockchainSession",
				Aliases: []string{"lbs"},
				Usage:   "list blockchain sessions for a user or provider",
				Action:  actions.listBlockchainSessions,
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "user",
						Required: false,
					},
					&cli.StringFlag{
						Name:     "provider",
						Required: false,
					},
					&cli.Int64Flag{
						Name:  "offset",
						Value: 0,
						Usage: "page offset into the results; must be >= 0",
					},
					&cli.UintFlag{
						Name:  "limit",
						Value: 10,
						Usage: "max results per page, 1-255 (the server binds this to a uint8; values above 255 are rejected rather than truncated, and 0 is rejected too since the server returns an empty page for it)",
					},
					// Empty on purpose. urfave/cli renders `(default: "<Value>")` in
					// --help, and any non-empty default here is a lie: resolveOrder
					// ignores this value unless the caller set the flag (IsSet), and an
					// unset flag sends no order parameter at all, so the SERVER default
					// applies -- effectively descending, not "asc". Empty suppresses the
					// rendered default and changes nothing else, since the value is only
					// read after IsSet and orderToServerString still rejects "" when the
					// flag IS set explicitly. See cli/chat/README.md and resolveOrder.
					&cli.StringFlag{
						Name:  "order",
						Value: "",
						Usage: "sort order, \"asc\" or \"desc\" (case-insensitive); omit the flag entirely to keep the tool's pre-pagination default order",
					},
				},
			},
			{
				Name:    "closeBlockchainSession",
				Aliases: []string{"cbs"},
				Usage:   "close a blockchain session",
				Action:  actions.closeBlockchainSession,
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "session",
						Required: true,
					},
				},
			},
			{
				Name:    "blockchainModels",
				Aliases: []string{"bm"},
				Usage:   "list models",
				Action:  actions.blockchainModels,
			},
			{
				Name:    "getAllowance",
				Aliases: []string{"ga"},
				Usage:   "get allowance",
				Action:  actions.getAllowance,
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "spender",
						Required: true,
					},
				},
			},
			{
				Name:    "approveAllowance",
				Aliases: []string{"aa"},
				Usage:   "approve allowance",
				Action:  actions.approveAllowance,
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "spender",
						Required: true,
					},
					&cli.Uint64Flag{
						Name:     "amount",
						Required: true,
					},
				},
			},
			{
				Name:    "proxyRouterConfig",
				Aliases: []string{"prc"},
				Usage:   "view proxy router config",
				Action:  actions.proxyRouterConfig,
			},
			{
				Name:    "blockchainProviders",
				Aliases: []string{"bp"},
				Usage:   "list blockchain providers",
				Action:  actions.blockchainProviders,
			},
			{
				Name:    "createBlockchainProvider",
				Aliases: []string{"bpc"},
				Usage:   "create a blockchain provider",
				Action:  actions.createBlockchainProvider,
				Flags: []cli.Flag{
					&cli.Uint64Flag{
						Name:     "stake",
						Required: true,
					},
					&cli.StringFlag{
						Name:     "endpoint",
						Required: true,
					},
				},
			},
			{
				Name:    "createBlockchainModel",
				Aliases: []string{"bmc"},
				Usage:   "create a blockchain model",
				Action:  actions.createBlockchainModel,
				Flags: []cli.Flag{
					&cli.Uint64Flag{
						Name:        "stake",
						Required:    false,
						DefaultText: "0",
					},
					&cli.Uint64Flag{
						Name:        "fee",
						Required:    false,
						DefaultText: "0",
					},
					&cli.StringFlag{
						Name:     "name",
						Required: true,
					},
					&cli.StringFlag{
						Name:     "ipfsID",
						Required: true,
					},
					&cli.StringFlag{
						Name:     "tags",
						Required: false,
						Usage:    "comma separated list of tags, ex. 'tag1,tag2'",
					},
				},
			},
			{
				Name:    "blockchainProviderBid",
				Aliases: []string{"bpb"},
				Usage:   "list provider bids",
				Action:  actions.blockchainProvidersBids,
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "address",
						Required: true,
					},
					&cli.Int64Flag{
						Name:  "offset",
						Value: 0,
						Usage: "page offset into the results; must be >= 0",
					},
					&cli.UintFlag{
						Name:  "limit",
						Value: 10,
						Usage: "max results per page, 1-255 (the server binds this to a uint8; values above 255 are rejected rather than truncated, and 0 is rejected too since the server returns an empty page for it)",
					},
				},
			},
			{
				Name:    "createBlockchainProviderBid",
				Aliases: []string{"cbpb"},
				Usage:   "createBlockchainProviderBid {{model}}",
				Action:  actions.createBlockchainProviderBid,
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "model",
						Required: true,
					},
					&cli.Uint64Flag{
						Name:     "pricePerSecond",
						Required: true,
					},
				},
			},
		},
	}

	if err := app.Run(os.Args); err != nil {
		log.Fatal(err)
	}
}

// pagination flag validation ------------------------------------------------
//
// Pure by design so they're covered directly in main_test.go without
// exercising the urfave/cli App.

// limitToUint8 converts a --limit value into the uint8 the proxy-router
// binds it to (structs.QueryOffsetLimitOrder.Limit, proxy-router/internal/blockchainapi/structs/req.go).
// A value above the server's uint8 ceiling is rejected instead of silently
// wrapping mod 256 (e.g. a bare uint8() conversion turns 256 into 0 and 300
// into 44 -- exactly the truncation this pagination fix exists to eliminate).
// Zero is rejected too, here rather than at the server: Limit is tagged
// validate:"gte=1" (structs/req.go:34), but that is a go-playground/validator
// tag and gin's ShouldBindQuery enforces only the binding tag, which is
// omitempty -- so limit=0 reaches the server and returns an empty page.
// listBlockchainSessions' full-page note (below) would otherwise print
// "a full page of results was returned" over zero rows.
func limitToUint8(limit uint) (uint8, error) {
	if limit == 0 {
		return 0, fmt.Errorf("--limit 0 is rejected by this CLI, not by the server: structs.QueryOffsetLimitOrder tags Limit validate:\"gte=1\" (proxy-router/internal/blockchainapi/structs/req.go:34), but gin binds on the binding tag, which is omitempty, so nothing runs that rule -- limit=0 reaches the server verbatim and comes back as an empty page, not a truncated one")
	}
	if limit > math.MaxUint8 {
		return 0, fmt.Errorf("--limit %d exceeds the maximum accepted value of %d", limit, math.MaxUint8)
	}
	return uint8(limit), nil
}

// validateOffset rejects a negative --offset before it reaches the server.
// The server's Offset field is tagged validate:"gte=0" (structs/req.go), but
// that's a go-playground/validator tag; gin's ShouldBindQuery does not
// enforce it, so a negative value would otherwise reach the server verbatim.
func validateOffset(offset int64) error {
	if offset < 0 {
		return fmt.Errorf("--offset %d must not be negative", offset)
	}
	return nil
}

// orderToServerString validates --order against the two documented values,
// case-insensitively, and maps it onto the exact string proxy-router's
// mapOrder (internal/blockchainapi/mappers.go) requires: "ASC" is the only
// string that mapper treats as ascending -- every other string, including a
// lowercase "asc", falls through to descending.
func orderToServerString(order string) (string, error) {
	switch strings.ToLower(order) {
	case "asc":
		return "ASC", nil
	case "desc":
		return "DESC", nil
	default:
		return "", fmt.Errorf("--order %q is not valid; accepted values are \"asc\" and \"desc\"", order)
	}
}

// resolveOrder decides what --order value (if any) reaches the server for a
// given listBlockchainSessions invocation. isSet is cCtx.IsSet("order"):
// true only if the caller explicitly passed --order on the command line.
//
// When isSet is false, resolveOrder returns ("", nil) -- the client's cue
// (see ListUserSessions/ListProviderSessions in cli/chat/client/client.go)
// to omit the order parameter from the request entirely, exactly matching
// what the pre-pagination CLI sent for THAT parameter (nothing); offset
// and limit are new and are always sent. That matters because
// proxy-router's mapOrder treats only the exact string "ASC" as ascending
// (internal/blockchainapi/mappers.go:105-110), while the server's own
// default is the lowercase "asc" (structs/req.go's
// `form:"order,default=asc"`), so "no order parameter" has always meant
// "let the server's own (buggy) default apply" -- i.e. effectively
// descending, newest-first. The operator has decided a bare
// `listBlockchainSession` must keep returning exactly that, even though
// it's a known server-side bug being filed separately (out of scope here;
// mappers.go is not touched by this fix).
//
// This is deliberately not done by hard-coding "desc"/"DESC" as the flag's
// own default value: that would bake today's server-side bug into the CLI
// permanently, and stay wrong the day the server-side fix ships. Omitting
// the parameter instead keeps deferring to "whatever the server's default
// currently is", which is exactly what "no parameter was sent" always meant.
//
// When isSet is true, --order asc and --order desc must mean what they say
// regardless of any of the above, so resolveOrder delegates to
// orderToServerString unconditionally.
func resolveOrder(isSet bool, value string) (string, error) {
	if !isSet {
		return "", nil
	}
	return orderToServerString(value)
}

type actions struct {
	client *client.ApiGatewayClient
}

func NewActions(c *client.ApiGatewayClient) *actions {
	return &actions{client: c}
}

func (a *actions) setupWallet(cCtx *cli.Context) error {
	err := a.client.CreateWallet(cCtx.Context, cCtx.String("privateKey"))
	if err != nil {
		return err
	}

	fmt.Println("Wallet setup successfully")
	return nil
}

func (a *actions) getWallet(cCtx *cli.Context) error {
	result, err := a.client.GetWallet(cCtx.Context)

	if err != nil {
		return err
	}

	fmt.Println("Wallet Address: ", result.Address)

	return nil
}

func (a *actions) getBalance(cCtx *cli.Context) error {
	eth, mor, err := a.client.GetBalance(cCtx.Context)

	if err != nil {
		return err
	}

	fmt.Println("ETH Balance: ", eth)
	fmt.Println("MOR Balance: ", mor)

	return nil
}

func (a *actions) startChatLocal(cCtx *cli.Context) error {
	models, err := a.client.GetLocalModels(cCtx.Context)

	if err != nil {
		return err
	}

	options := &chatCommon.Options{
		LocalModels:   *models,
		UseLocalModel: true,
		Client:        a.client,
	}

	chat.Run(options)

	return nil
}

func (a *actions) startRemoteChat(cCtx *cli.Context) error {
	sessionId := cCtx.String("session")

	var options *chatCommon.Options

	if sessionId == "" {
		fmt.Println("Loading remote models...")
		models, err := a.client.GetAllModels(cCtx.Context)

		if err != nil {
			return err
		}

		var resultModels []interface{}
		for _, item := range models["models"].([]interface{}) {
			model := item.(map[string]interface{})
			if model["DeletedAt"] != nil {
				continue
			}

			modelId := model["Id"].(string)
			bids, err := a.client.GetBidsByModelAgent(cCtx.Context, modelId, "0", "100")
			if err != nil {
				return err
			}

			var resultBids []interface{}
			for _, item := range bids["bids"].([]interface{}) {
				bid := item.(map[string]interface{})
				if bid["DeletedAt"] != "0" {
					continue
				}
				resultBids = append(resultBids, bid)
			}

			if len(resultBids) == 0 {
				continue
			}
			model["bids"] = resultBids
			resultModels = append(resultModels, model)
		}

		options = &chatCommon.Options{
			UseLocalModel: false,
			RemoteModels:  resultModels,
			Client:        a.client,
		}
	} else {
		options = &chatCommon.Options{
			UseLocalModel: false,
			Client:        a.client,
			Session:       sessionId,
		}
	}

	chat.Run(options)

	return nil
}

func (a *actions) getAllowance(cCtx *cli.Context) error {
	spender := cCtx.String("spender")
	res, err := a.client.GetAllowance(cCtx.Context, spender)
	if err != nil {
		return err
	}

	fmt.Println("Allowance =", res["allowance"], "MOR")
	return nil
}

func (a *actions) approveAllowance(cCtx *cli.Context) error {
	spender := cCtx.String("spender")
	amount := cCtx.Uint64("amount")
	res, err := a.client.ApproveAllowance(cCtx.Context, spender, amount)
	if err != nil {
		return err
	}
	fmt.Println("Allowance approved, tx:", res["tx"])
	return nil
}

func (a *actions) healthcheck(cCtx *cli.Context) error {
	res, err := a.client.HealthCheck(cCtx.Context)
	if err != nil {
		return err
	}
	// Output the result of the healthcheck
	jsonData, err := json.Marshal(res)
	fmt.Println(string(jsonData))
	return nil
}

func (a *actions) proxyRouterConfig(cCtx *cli.Context) error {
	config, err := a.client.GetProxyRouterConfig(cCtx.Context)
	if err != nil {
		return err
	}
	jsonData, err := json.Marshal(config)
	fmt.Println(string(jsonData))
	return nil
}

func (a *actions) proxyRouterFiles(cCtx *cli.Context) error {
	files, err := a.client.GetProxyRouterFiles(cCtx.Context)

	if err != nil {
		return err
	}

	jsonData, err := json.Marshal(files)
	fmt.Println(string(jsonData))
	return nil
}

func (a *actions) initiateProxySession(cCtx *cli.Context) error {
	session, err := a.client.InitiateSession(cCtx.Context)
	if err != nil {
		return err
	}
	jsonData, err := json.Marshal(session)
	fmt.Println(string(jsonData))
	return nil
}

func (a *actions) blockchainProviders(cCtx *cli.Context) error {
	providers, err := a.client.GetAllProviders(cCtx.Context)

	if err != nil {
		return err
	}

	for _, item := range providers["providers"].([]interface{}) {
		provider := item.(map[string]interface{})
		fmt.Println(provider["Address"], " - ", provider["Endpoint"])
	}

	return nil
}

func (a *actions) createBlockchainProvider(cCtx *cli.Context) error {
	stake := cCtx.Uint64("stake")
	endpoint := cCtx.String("endpoint")

	diamondAddr, err := a.client.GetDiamondAddress(cCtx.Context)
	if err != nil {
		return err
	}
	_, err = a.client.ApproveAllowance(cCtx.Context, diamondAddr.Hex(), stake)
	if err != nil {
		return err
	}

	providers, err := a.client.CreateNewProvider(cCtx.Context, stake, endpoint)
	if err != nil {
		return err
	}

	jsonData, err := json.Marshal(providers)
	fmt.Println(string(jsonData))
	return nil
}

func (a *actions) createBlockchainProviderBid(cCtx *cli.Context) error {
	model := cCtx.String("model")
	pricePerSecond := cCtx.Uint64("pricePerSecond")

	diamondAddr, err := a.client.GetDiamondAddress(cCtx.Context)
	if err != nil {
		return err
	}
	_, err = a.client.ApproveAllowance(cCtx.Context, diamondAddr.Hex(), 300000000000000000)
	if err != nil {
		return err
	}

	result, err := a.client.CreateNewProviderBid(cCtx.Context, model, pricePerSecond)
	if err != nil {
		return err
	}

	var bid map[string]interface{}
	bid = result["bid"].(map[string]interface{})

	fmt.Println("Bid created for model ", model)
	fmt.Println("Bid ID: ", bid["Id"])
	return nil
}

func (a *actions) createBlockchainModel(cCtx *cli.Context) error {
	name := cCtx.String("name")
	ipfsID := cCtx.String("ipfsID")
	stake := cCtx.Uint64("stake")
	fee := cCtx.Uint64("fee")
	tags := cCtx.String("tags")

	tagsArr := []string{}
	if tags != "" {
		tagsArr = strings.Split(tags, ",")
	}

	result, err := a.client.CreateNewModel(cCtx.Context, name, ipfsID, stake, fee, tagsArr)
	if err != nil {
		return err
	}

	var model map[string]interface{}
	model = result["model"].(map[string]interface{})

	fmt.Println("Model created: ", model["Name"])
	fmt.Println("Model ID: ", model["Id"])
	fmt.Println("Model Stake: ", model["Stake"])
	fmt.Println("Model Fee: ", model["Fee"])
	fmt.Println("Model Tags: ", model["Tags"])
	fmt.Println("Model IpfsCID: ", model["IpfsCID"])

	return nil
}

type Bid struct {
	Id             string
	Provider       common.Address
	ModelAgentId   string
	PricePerSecond *big.Int
	Nonce          *big.Int
	CreatedAt      *big.Int
	DeletedAt      *big.Int
}

func (a *actions) blockchainProvidersBids(cCtx *cli.Context) error {
	address := cCtx.String("address")
	offset := cCtx.Int64("offset")

	if err := validateOffset(offset); err != nil {
		return err
	}

	limit, err := limitToUint8(cCtx.Uint("limit"))
	if err != nil {
		return err
	}

	bidsResult, err := a.client.GetBidsByProvider(cCtx.Context, address, big.NewInt(offset), limit)

	if err != nil {
		return err
	}

	bidsMap := bidsResult.(map[string]interface{})

	bids := bidsMap["bids"].([]interface{})

	if len(bids) == 0 {
		fmt.Println("No bids")
		return nil
	}

	for _, item := range bids {
		bid := item.(map[string]interface{})
		fmt.Println("Bid: ", bid["Id"])
		fmt.Println("\t- price per second: ", bid["PricePerSecond"])
		fmt.Println("\t- model: ", bid["ModelAgentId"])
	}

	return nil
}

func (a *actions) blockchainModels(cCtx *cli.Context) error {
	modelsResult, err := a.client.GetAllModels(cCtx.Context)
	if err != nil {
		return err
	}

	models := modelsResult["models"].([]interface{})

	for _, item := range models {
		model := item.(map[string]interface{})
		fmt.Println("\n", "Model: ", model["Name"], " - ", model["Id"])
		fmt.Println("\t- provider: ", model["Owner"])
	}

	fmt.Println()

	return nil
}

func (a *actions) openBlockchainSession(cCtx *cli.Context) error {

	session, err := a.client.OpenStakeSession(cCtx.Context, &client.SessionStakeRequest{
		Approval:    cCtx.String("approval"),
		ApprovalSig: cCtx.String("approvalSig"),
		Stake:       cCtx.Uint64("stake"),
	})

	if err != nil {
		return err
	}

	fmt.Println("session opened: ", session.SessionId)
	return nil
}

func (a *actions) listBlockchainSessions(cCtx *cli.Context) error {
	userAddress := cCtx.String("user")
	providerAddress := cCtx.String("provider")
	offset := cCtx.Int64("offset")
	rawLimit := cCtx.Uint("limit")

	if userAddress == "" && providerAddress == "" {
		return fmt.Errorf("please provide either a user or provider address")
	}

	if err := validateOffset(offset); err != nil {
		return err
	}

	limit, err := limitToUint8(rawLimit)
	if err != nil {
		return err
	}

	order, err := resolveOrder(cCtx.IsSet("order"), cCtx.String("order"))
	if err != nil {
		return err
	}

	var sessions []client.SessionListItem
	if userAddress != "" {
		sessions, err = a.client.ListUserSessions(cCtx.Context, userAddress, big.NewInt(offset), limit, order)
	} else {
		sessions, err = a.client.ListProviderSessions(cCtx.Context, providerAddress, big.NewInt(offset), limit, order)
	}

	if err != nil {
		return err
	}

	if len(sessions) == 0 {
		fmt.Println("No sessions")
		return nil
	}

	for _, item := range sessions {
		var isActive bool
		if item.CloseoutReceipt != "" {
			isActive = false
		} else {
			isActive = true
		}

		fmt.Println("\n", "Session: ", item.Session)
		fmt.Println("\t- provider: ", item.ModelORAgent)
		fmt.Println("\t- price per second: ", item.PricePerSecond)
		fmt.Println("\t- closed: ", !isActive)
		fmt.Println("\t- expired: ", item.EndsAt < uint64(time.Now().Unix()))

	}

	// limit is guaranteed >= 1 by limitToUint8 (0 is rejected), so
	// len(sessions) == 0 can never equal limit here -- an empty page can no
	// longer be misreported as "full".
	if uint(len(sessions)) == uint(limit) {
		fmt.Fprintln(os.Stderr, "note: a full page of results was returned; more sessions may exist, use --offset to page further")
	}

	return nil
}

func (a *actions) closeBlockchainSession(cCtx *cli.Context) error {

	sessionId := cCtx.String("session")

	err := a.client.CloseSession(cCtx.Context, sessionId)

	if err != nil {
		return err
	}

	fmt.Printf("Your request to close session %v was sent without issue.", sessionId)
	return nil
}
