export type AgentUserRes = {
  agents: AgentUser[]
}

export type AgentUser = {
  allowances: Record<'ETH' | string, string>
  isConfirmed: boolean
  password: string
  perms: string[]
  username: string
}

export type AgentTxRes = {
  txHashes: string[]
  nextCursor: string
}

export type AgentAllowanceRequestsRes = {
  requests: AgentAllowanceRequest[]
}

export type AgentAllowanceRequest = {
  username: string
  token: string
  allowance: string
}

export type ChatTitle = {
  chatId: string
  createdAt: number
  isLocal: boolean
  modelId: string
  title: string
  // The session this chat is bound to. Optional because chats written before the
  // router persisted it have no value, and local-model chats never do.
  sessionId?: string
}

export type ChatHistory = {
  title: string
  modelId: string
  isLocal: boolean
  // Was declared here long before the router actually sent it — the Go struct had
  // no such field, so every read was `undefined`. It is real now; keep it
  // optional so pre-existing chat files (which have no sessionId) type honestly.
  sessionId?: string
  messages: ChatMessage[]
}

export type ChatMessage = {
  response: string
  prompt: {
    messages: {
      role: string
      content: string
    }[]
  }
  promptAt: number
  responseAt: number
  isImageContent: boolean
  isVideoRawContent: boolean
}

export type ResultResponse = {
  result: boolean
}
