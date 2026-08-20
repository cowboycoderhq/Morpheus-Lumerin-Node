export interface ChatTitle {
    chatId: string;
    title: string;
    createdAt: number; // timestamp in seconds
    modelId: string;
    isLocal?: boolean;
}

export interface ChatData {
    id: string;
    title?: string;
    createdAt: Date;
    modelId: string;
    isLocal?: boolean;
    // The session THIS chat talks through. The binding lives on the chat, not on
    // the model: several chats can share a model while holding separate sessions
    // (including two sessions with the same provider), which is impossible if the
    // session is re-derived from the model on every switch.
    sessionId?: string;
}

export interface HistoryMessage {
    id: string;
    text: string;
    user: string;
    role: string;
    icon: string;
    color: string;
    isImageContent?: boolean;
    isVideoRawContent?: boolean;
}

export interface ChatHistoryInterface {
    title: string;
    modelId: string;
    messages: ChatMessage[];
}

export interface ChatMessage {
    response: string;
    prompt: ChatPrompt;
    promptAt: number;
    responseAt: number;
    isImageContent?: boolean;
    isVideoRawContent?: boolean;
}

export interface ChatPrompt {
    model: string;
    messages: {
        role: string;
        content: string;
    }[];
}

