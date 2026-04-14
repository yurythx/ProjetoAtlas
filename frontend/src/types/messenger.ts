/**
 * Messenger module — shared TypeScript types.
 *
 * These interfaces mirror the Django REST Framework serializers.
 * Keep them in sync with:
 *   - backend/apps/messenger/serializers.py
 *   - backend/apps/messenger/models.py
 */

// ─── Core Entities ────────────────────────────────────────────────────────────

export interface MessageReaction {
    id: number
    user: number
    user_username: string
    emoji: string
    created_at: string
}

/** Condensed representation of a message used inside reply_to fields. */
export interface ReplyMessage {
    id: number
    content: string | null
    sender: number
    sender_username: string
    created_at: string
    file_name: string | null
    file_type: string | null
}

export interface Message {
    id: number
    client_id?: string | null
    conversation: number
    sender: number
    sender_username: string
    /** Text content. null if the message was sent with only a file, or soft-deleted. */
    content: string | null
    /** Original file field (not normally used directly — prefer file_url). */
    file?: string | null
    file_url: string | null
    file_name: string | null
    file_type: string | null
    file_size: number | null
    created_at: string
    is_delivered?: boolean
    delivered_by_count?: number
    delivered_by_user_ids?: number[]
    is_read: boolean
    read_by_count?: number
    read_by_user_ids?: number[]
    /** Set when the message has been edited. */
    edited_at: string | null
    /** True if the message was soft-deleted. UI should render "[Mensagem apagada]". */
    is_deleted: boolean
    conversation_title?: string | null
    conversation_is_group?: boolean
    conversation_participants_list?: string[]
    local_status?: 'sending' | 'sent' | 'failed'
    reactions: MessageReaction[]
    reply_to: ReplyMessage | null
}

/** User preference for a specific conversation (mute / pin). */
export interface ConversationPreference {
    is_muted: boolean
    is_pinned: boolean
    is_deleted?: boolean
    deleted_at?: string | null
    cleared_at?: string | null
    is_archived?: boolean
    archived_at?: string | null
}

export interface Conversation {
    id: number
    /** List of participant user IDs (raw ManyToMany). Use participants_list for usernames. */
    participants: number[]
    participants_list: string[]
    created_at: string
    updated_at: string
    title: string | null
    is_group: boolean
    last_message: ReplyMessage | null
    /** Annotated by the backend via SQL Count — number of unread messages for the current user. */
    unread_count: number
    /** User-specific mute/pin settings, backed by ConversationPreference. */
    preference: ConversationPreference
}

// ─── WebSocket Payloads ───────────────────────────────────────────────────────

/** Payload received from the server for a new real-time message. */
export interface WsMessagePayload {
    type: 'message'
    message: string | null
    sender_id: number
    sender_username: string
    message_id: number
    client_id?: string | null
    created_at: string
    file_url: string | null
    file_name: string | null
    file_type: string | null
    file_size: number | null
    reply_to: ReplyMessage | null
}

/** Payload received when a message is edited in real-time. */
export interface WsEditPayload {
    type: 'edit_message'
    message_id: number
    content: string
    edited_at: string
}

/** Payload received when a message is soft-deleted in real-time. */
export interface WsDeletePayload {
    type: 'delete_message'
    message_id: number
}

/** Payload received for typing indicators. */
export interface WsTypingPayload {
    type: 'typing'
    user_id: number
    username: string
    is_typing: boolean
}

/** Payload received for emoji reactions. */
export interface WsReactionPayload {
    type: 'reaction'
    message_id: number
    user_id: number
    username: string
    emoji: string
    action: 'add' | 'remove'
}

/** Payload received when a message is marked as read. */
export interface WsReadReceiptPayload {
    type: 'read_receipt'
    message_id: number
    user_id: number
    is_read: boolean
}

export type WsPayload =
    | WsMessagePayload
    | WsEditPayload
    | WsDeletePayload
    | WsTypingPayload
    | WsReactionPayload
    | WsReadReceiptPayload
