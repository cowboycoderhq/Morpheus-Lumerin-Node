## Full Flow Example for an Agent User Using the Proxy-Router API

### How to run

1. **Run the proxy-router.**
2. **Update `config.js`** with the desired values:
   - **`proxyRouterUrl`** – The HTTP proxy-router URL.
   - **`modelId`** – The local model to use.
   - **`morTokenAddress`** – The MOR token the agent's allowance is denominated in.
     It must match the network the proxy-router is pointed at, i.e. the
     `MOR_TOKEN_ADDRESS` in the router's `.env`. The shipped default is Base Mainnet,
     matching the uncommented block in `proxy-router/.env.example`; for Base Sepolia use
     the token from that file's commented TESTNET block.
   - **`agentUsername`, `agentPassword`, `agentPerms`** – The agent user data to be created.
3. **Run `node ./agent-user-request.js`.** An agent user request will be sent to the proxy-router.
4. **Approve the agent user creation** using an admin user in the proxy-router
   (`http://localhost:8082/swagger/index.html#/auth/post_auth_users_confirm`).
5. **Run `node agent-run.js`.**