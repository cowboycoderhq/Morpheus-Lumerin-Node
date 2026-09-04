const {
  proxyRouterUrl,
  agentPassword,
  agentPerms,
  agentUsername,
  morTokenAddress,
} = require("./config");

const requestAgentUser = (username, password, perms, allowances) => {
  return fetch(`${proxyRouterUrl}/auth/users/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password, perms, allowances }),
  });
};

// MOR has 18 decimals, so 10 MOR is 10 * 10^18 base units.
// The proxy-router binds allowances into a map[string]string
// (proxy-router/internal/authapi/requests.go) and parses each value with
// big.Int.SetString(value, 10) (internal/system/auth.go), so it must go on
// the wire as a base-10 STRING. A JS number cannot carry it safely (the
// product exceeds Number.MAX_SAFE_INTEGER) and a BigInt cannot be sent
// either (JSON.stringify throws on one). Do the arithmetic in BigInt, then
// render a decimal string.
const MOR_DECIMALS = 18n;
const ALLOWANCE_MOR = 10n;
const ALLOWANCE_BASE_UNITS = (ALLOWANCE_MOR * 10n ** MOR_DECIMALS).toString();

(async () => {
    const allowances = {
        [morTokenAddress]: ALLOWANCE_BASE_UNITS,
    };

    const response = await requestAgentUser(agentUsername, agentPassword, agentPerms, allowances);
    const data = await response.json();
    console.log(data);
})();