const proxyRouterUrl = 'http://localhost:8082';
const agentUsername = 'agent-test-1';
const agentPassword = '123456';
const agentPerms = ['get_local_models', 'get_balance', 'chat'];

// Address of the MOR token the agent's allowance is denominated in.
// This MUST match the network the proxy-router is pointed at: it is the
// MOR_TOKEN_ADDRESS from the router's .env. The value below is Base Mainnet,
// which is what proxy-router/.env.example ships uncommented by default.
// For Base Sepolia, use the token from that file's commented TESTNET block.
const morTokenAddress = '0x7431ada8a591c955a994a21710752ef9b882b8e3';

const modelId =
  "0xe086adc275c99e32bb10b0aff5e8bfc391aad18cbb184727a75b2569149425c1";

module.exports = {
  proxyRouterUrl,
  agentUsername,
  agentPassword,
  agentPerms,
  morTokenAddress,
  modelId,
};