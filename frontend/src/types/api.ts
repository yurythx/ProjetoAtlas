/**
 * api.ts — Strongly typed interfaces for all API responses.
 *
 * F6: Expands type coverage beyond the 2 existing files to cover all modules.
 * Usage: import { ApiResponse, PaginatedResponse, ... } from '@/types/api'
 */

// ---------------------------------------------------------------------------
// Generic wrappers
// ---------------------------------------------------------------------------

/** Standard DRF error detail shape. */
export interface ApiError {
    detail?: string;
    [field: string]: string | string[] | undefined;
}

/** DRF paginated list response. */
export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

/** Generic success/message response (e.g., logout, password reset). */
export interface MessageResponse {
    detail: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface LoginRequest {
    username: string;
    password: string;
}

export interface TokenPair {
    access: string;
    refresh: string;
}

export interface PasswordResetRequest {
    email: string;
}

export interface PasswordResetConfirm {
    token: string;
    new_password: string;
}

export interface ChangePasswordRequest {
    old_password: string;
    new_password: string;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface UserCreateRequest {
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
    password: string;
    role?: number;
}

export interface UserUpdateRequest {
    first_name?: string;
    last_name?: string;
    email?: string;
    role?: number;
    status?: 'online' | 'busy' | 'offline';
    avatar?: File | null;
}

export interface InvitationCreate {
    email: string;
    role?: number;
}

export interface InvitationAccept {
    token: string;
    username: string;
    password: string;
    first_name?: string;
    last_name?: string;
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export type ArticleStatus = 'draft' | 'pending' | 'published' | 'rejected';

export interface ArticleCreateRequest {
    title: string;
    content: string;
    excerpt?: string;
    status?: ArticleStatus;
    is_public?: boolean;
    category?: number | null;
    tags?: number[];
    meta_title?: string;
    meta_description?: string;
    meta_keywords?: string;
    image?: File | null;
}

export interface ArticleUpdateRequest extends Partial<ArticleCreateRequest> { }

export interface ArticleHistoryEntry {
    id: number;
    revision_id: number;
    date_created: string;
    user?: number;
    user_username?: string;
    comment: string;
    field_diffs?: Record<string, { old: unknown; new: unknown }>;
}

export interface ArticleAnalytics {
    article_id: number;
    title: string;
    views_count: number;
    unique_visitors: number;
    views_last_7_days: number;
    views_last_30_days: number;
}

export interface GlobalArticleAnalytics {
    total_articles: number;
    total_views: number;
    published_articles: number;
    draft_articles: number;
    top_articles: ArticleAnalytics[];
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export interface MediaFile {
    id: number;
    file: string;
    file_url: string;
    file_name: string;
    file_type: string;
    file_size: number;
    uploaded_by?: number;
    uploaded_by_username?: string;
    created_at: string;
}

export interface MediaUploadRequest {
    file: File;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface PushSubscriptionCreate {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

export interface NotificationPayload {
    title: string;
    body: string;
    data?: {
        url?: string;
    };
    icon?: string;
}

// ---------------------------------------------------------------------------
// Licensing
// ---------------------------------------------------------------------------

export interface PlanFeatureDetail {
    feature_code: string;
    feature_name: string;
    value: string;
}

export interface PlanDetail {
    id: number;
    name: string;
    slug: string;
    price: string;
    features: PlanFeatureDetail[];
}

export interface LicenseDetail {
    id: number;
    plan: PlanDetail;
    start_date: string;
    end_date?: string | null;
    is_active: boolean;
    days_remaining?: number | null;
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | string;

export interface AuditLogEntry {
    id: number;
    user?: number;
    user_username?: string;
    action: AuditAction;
    resource: string;
    resource_id?: string | null;
    details: Record<string, unknown>;
    ip_address?: string | null;
    created_at: string;
}

// ---------------------------------------------------------------------------
// Module Manager
// ---------------------------------------------------------------------------

export interface ModuleConfig {
    /** Feature toggles specific to this module (free-form JSON). */
    [key: string]: unknown;
}

export interface TenantModuleUpdate {
    is_active: boolean;
    config?: ModuleConfig;
}

// ---------------------------------------------------------------------------
// Company / Onboarding
// ---------------------------------------------------------------------------

export type OnboardingStep = 1 | 2 | 3 | 4;

export interface CompanyUpdate {
    name?: string;
    domain?: string | null;
}

export interface OnboardingStepPayload {
    step: OnboardingStep;
    data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// WebSocket event shapes (used in frontend WS consumers)
// ---------------------------------------------------------------------------

export type WsEventType =
    | 'chat_message'
    | 'message_read'
    | 'message_deleted'
    | 'message_reaction'
    | 'message_edited'
    | 'typing'
    | 'presence_update'
    | 'error';

export interface WsBaseEvent {
    type: WsEventType;
}

export interface WsChatMessageEvent extends WsBaseEvent {
    type: 'chat_message';
    message: import('./index').Message;
}

export interface WsTypingEvent extends WsBaseEvent {
    type: 'typing';
    user_id: number;
    username: string;
    is_typing: boolean;
}

export interface WsPresenceEvent extends WsBaseEvent {
    type: 'presence_update';
    user_id: number;
    status: 'online' | 'offline';
}

export interface WsMessageReadEvent extends WsBaseEvent {
    type: 'message_read';
    message_ids: number[];
    reader_id: number;
}

export type WsEvent =
    | WsChatMessageEvent
    | WsTypingEvent
    | WsPresenceEvent
    | WsMessageReadEvent
    | WsBaseEvent;
