export interface Role {
  id: number;
  name: string;
  description?: string;
  permissions: string[];
  is_system_role: boolean;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  groups: string[];
  crm_groups?: number[];
  role?: number;
  role_details?: Role;
  is_superuser?: boolean;
  is_staff?: boolean;
  is_active?: boolean;
  avatar?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  status: 'online' | 'busy' | 'offline';
  company?: number | Company;
  last_login?: string | null;
  date_joined?: string;
  last_seen?: string | null;
}

export interface CRMGroup {
  id: number
  name: string
  slug: string
}

export interface Contact {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_online: boolean;
  group_names: string[];
  is_staff: boolean;
  avatar_url?: string | null;
  last_seen?: string | null;
  status: 'online' | 'busy' | 'offline';
}

export interface MessageReaction {
  id: number;
  user: number;
  user_username: string;
  emoji: string;
  created_at: string;
}

export interface Message {
  id: number;
  content: string;
  sender: number;
  sender_username?: string;
  conversation: number;
  created_at: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  reactions?: MessageReaction[];
  is_read?: boolean;
  edited_at?: string | null;
  reply_to?: {
    id: number;
    content: string;
    sender: number;
    sender_username: string;
    created_at: string;
    file_name?: string;
    file_type?: string;
  } | null;
}

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
  id: number;
  /** List of participant user IDs (raw ManyToMany). */
  participants: number[];
  /** List of participant usernames, returned by get_participants_list in serializer. */
  participants_list?: string[];
  title?: string | null;
  is_group?: boolean;
  last_message?: Message;
  unread_count?: number;
  created_at: string;
  updated_at: string;
  /** User-specific mute/pin settings, backed by ConversationPreference model. */
  preference?: ConversationPreference;
  /** Full participant contact objects (populated in frontend only when available). */
  participants_details?: Contact[];
}

export interface TenantBranding {
  id: number;
  company: string;
  company_name: string;
  logo: string | null;
  logo_url: string | null;
  icon: string | null;
  icon_url: string | null;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  font_family: string;
  theme_palette: string;
  custom_css: string;
  custom_js: string;
  footer_text: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserThemePreference {
  id: number;
  user: number;
  theme_palette: string | null;
  use_tenant_theme: boolean;
  dark_mode_preference: 'light' | 'dark' | 'system';
  created_at: string;
  updated_at: string;
}

export interface UserNotificationPreference {
  id: number;
  user: number;
  notify_moderation_comment_pending: boolean;
  notify_moderation_reply_pending: boolean;
  notify_reply_approved_single: boolean;
  notify_reply_approved_thread: boolean;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  onboarding_completed: boolean;
  onboarding_step: number;
  theme_branding?: TenantBranding;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  access: string;
  refresh: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
}

export interface Article {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  is_public?: boolean; // Visibility control: public (true) or private (false)
  published_at?: string;
  status: 'draft' | 'pending' | 'published' | 'rejected' | 'scheduled';

  author: number; // ID
  category: number | null; // ID
  tags: number[]; // IDs
  tag_list?: Tag[]; // Full objects if read
  created_at: string;
  updated_at: string;
  image?: string | null;
  cover_image?: string | null; // Alternative field name for image
  author_name?: string;
  author_info?: {
    id: number;
    username: string;
    full_name: string;
    avatar_url?: string | null;
    bio?: string | null;
  } | null;
  category_name?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  company_name?: string;
  company_slug?: string;
  comment_count?: number;
}

export interface PlanFeature {
  feature_code: string;
  feature_name: string;
  value: string;
}

export interface Plan {
  id: number;
  name: string;
  price: string;
  features: PlanFeature[];
}

export interface License {
  id: number;
  plan: number; // Plan ID
  plan_name: string;
  start_date: string;
  end_date?: string;
  is_active: boolean;
}

export interface Module {
  id: number;
  code: string;
  name: string;
  description: string;
  is_default: boolean; // M3: campo correto (is_global não existe no model)
}

export interface TenantModule {
  id: number;
  module: number; // ID
  module_code: string; // From serializer
  module_name: string; // From serializer
  module_details?: Module; // If expanded
  is_active: boolean;
  config?: Record<string, unknown> | null;
}
export interface Page {
  id: number;
  title: string;
  slug: string;
  content: string;
  status: 'draft' | 'published';
  company: string; // UUID
  created_at: string;
  updated_at: string;

  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
}
