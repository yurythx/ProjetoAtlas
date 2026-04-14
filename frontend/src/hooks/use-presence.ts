// Re-export from the centralized presence context.
// All components (Header, ContactList, ChatWindow, ProfileForm) import from here,
// and the PresenceProvider (mounted once in DashboardLayout) ensures a single shared
// WebSocket connection instead of one per component.
export { useUserPresence as usePresence, UserPresenceProvider as PresenceProvider } from '@/contexts/presence-context';
export type { UserStatus } from '@/contexts/presence-context';

