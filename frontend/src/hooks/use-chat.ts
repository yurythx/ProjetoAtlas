import { useState, useCallback, useRef, useEffect } from 'react';

import useWebSocket, { ReadyState } from 'react-use-websocket';
import { Message } from '@/types/messenger';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function useChat(conversationId: number | null, currentUserId?: number | null, expectedReaders?: number) {
  const [typingUsers, setTypingUsers] = useState<Record<number, string | null>>({});
  const queryClient = useQueryClient();
  const deliveredAckRef = useRef<Set<number>>(new Set())
  const readAckRef = useRef<Set<number>>(new Set())
  const pendingDeliveredRef = useRef<Set<number>>(new Set())
  const pendingReadRef = useRef<Set<number>>(new Set())
  const ackFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readyStateRef = useRef<ReadyState>(ReadyState.CLOSED)

  // Debounce ref for typing status — a single timer, replaced on each keystroke
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const companySlug = typeof window !== 'undefined' ? localStorage.getItem('companySlug') : null;
  const envCompany = process.env.NEXT_PUBLIC_COMPANY_SLUG;
  const effectiveCompany = companySlug || envCompany || undefined;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
  const isSecure = (typeof window !== 'undefined' && window.location.protocol === 'https:') || apiUrl.startsWith('https');
  const protocol = isSecure ? 'wss:' : 'ws:';
  const host = apiUrl.replace(/^https?:\/\//, '');
  const socketUrl = conversationId && token
    ? `${protocol}//${host}/ws/chat/${conversationId}/?token=${encodeURIComponent(token)}${effectiveCompany ? `&company_slug=${encodeURIComponent(effectiveCompany)}` : ''}`
    : null;

  const { sendMessage, lastJsonMessage, readyState } = useWebSocket(socketUrl, {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    onOpen: () => {
      // Connection established — no toast to avoid noise
    },
    onClose: () => {
      // Reconnection is handled automatically by shouldReconnect
    },
    onError: (event) => {
      console.error("WebSocket error:", event);
      toast.error("Erro na conexão do chat. Verifique sua internet.");
    },
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data);

        // ── Typing indicator ──────────────────────────────────
        if (data.type === 'typing') {
          setTypingUsers((prev) => {
            const next = { ...prev };
            if (data.is_typing) {
              next[data.user_id] = data.username;
            } else {
              delete next[data.user_id];
            }
            return next;
          });
          return;
        }

        // ── New message ───────────────────────────────────────
        if (data.type === 'message') {
          const newMessage: Message = {
            id: data.message_id,
            client_id: data.client_id ?? null,
            content: data.message,
            sender: data.sender_id,
            sender_username: data.sender_username,
            conversation: conversationId!,
            created_at: data.created_at,
            file_url: data.file_url,
            file_name: data.file_name,
            file_type: data.file_type,
            file_size: data.file_size,
            reply_to: data.reply_to ?? null,
            reactions: [],
            is_delivered: typeof currentUserId === 'number' && data.sender_id === currentUserId ? false : undefined,
            delivered_by_user_ids: typeof currentUserId === 'number' && data.sender_id === currentUserId ? [] : undefined,
            delivered_by_count: typeof currentUserId === 'number' && data.sender_id === currentUserId ? 0 : undefined,
            is_read: false,
            read_by_user_ids: typeof currentUserId === 'number' && data.sender_id === currentUserId ? [] : undefined,
            read_by_count: typeof currentUserId === 'number' && data.sender_id === currentUserId ? 0 : undefined,
            edited_at: null,
            is_deleted: false,
            local_status: 'sent',
          };


          // Insert directly into React Query cache (avoid unnecessary HTTP refetch)
          type MessagesPage = { results: Message[]; next: string | null };
          type MessagesData = { pages: MessagesPage[]; pageParams?: unknown[] };
          queryClient.setQueryData<MessagesData | undefined>(
            ['messages', conversationId],
            (oldData) => {
              if (!oldData || !Array.isArray(oldData.pages)) {
                // Cache not populated yet or being refetched — fall back to invalidation
                queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
                return oldData;
              }
              // Pagination newest -> oldest: pages[0] is the newest page.
              // We prepend/append to the FIRST page to ensure it's in the latest results.
              let pages = [...oldData.pages];
              const firstPage = pages[0];
              const alreadyExists = pages.some((p) => Array.isArray(p.results) && p.results.some((m) => m.id === newMessage.id));
              if (alreadyExists) return oldData;
              if (newMessage.client_id) {
                pages = pages.map((p) => ({
                  ...p,
                  results: Array.isArray(p.results) ? p.results.filter((m) => m.client_id !== newMessage.client_id) : p.results,
                }));
              }
              pages[0] = {
                ...firstPage,
                results: [...(firstPage.results ?? []), newMessage],
              };
              return { pages, pageParams: oldData.pageParams ?? [] };
            }
          );
          // Invalidate conversations list so unread count and last message update in sidebar
          queryClient.invalidateQueries({ queryKey: ['conversations'] });

          // Clear sender from typing users when their message arrives
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[data.sender_id];
            return next;
          });

          if (typeof currentUserId === 'number' && data.sender_id !== currentUserId) {
            if (!deliveredAckRef.current.has(data.message_id)) {
              deliveredAckRef.current.add(data.message_id)
              pendingDeliveredRef.current.add(data.message_id)
            }

            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
              if (!readAckRef.current.has(data.message_id)) {
                readAckRef.current.add(data.message_id)
                pendingReadRef.current.add(data.message_id)
              }
            }

            if (!ackFlushTimerRef.current) {
              ackFlushTimerRef.current = setTimeout(() => {
                ackFlushTimerRef.current = null
                if (readyStateRef.current !== ReadyState.OPEN) return

                const deliveredIds = Array.from(pendingDeliveredRef.current)
                const readIds = Array.from(pendingReadRef.current)
                pendingDeliveredRef.current.clear()
                pendingReadRef.current.clear()

                if (deliveredIds.length) {
                  sendMessage(JSON.stringify({ type: 'delivered', message_ids: deliveredIds }))
                }
                if (readIds.length) {
                  sendMessage(JSON.stringify({ type: 'mark_read', message_ids: readIds }))
                }
              }, 150)
            }
          }
          return;
        }

        // ── Read all in conversation ──────────────────────────
        if (data.type === 'read_all') {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          return;
        }

        // ── Reaction update ───────────────────────────────────
        if (data.type === 'reaction') {
          type MessagesPage = { results: Message[]; next: string | null };
          type MessagesData = { pages: MessagesPage[]; pageParams?: unknown[] };
          queryClient.setQueryData<MessagesData | undefined>(
            ['messages', conversationId],
            (oldData) => {
              if (!oldData || !Array.isArray(oldData.pages)) return oldData;
              return {
                pages: oldData.pages.map((page) => ({
                  ...page,
                  results: Array.isArray(page.results)
                    ? page.results.map((msg: Message) => {
                      if (msg.id !== data.message_id) return msg;
                      const currentReactions = msg.reactions || [];
                      if (data.action === 'add') {
                        if (currentReactions.some((r) => r.user === data.user_id && r.emoji === data.emoji))
                          return msg;
                        return {
                          ...msg,
                          reactions: [
                            ...currentReactions,
                            {
                              id: Date.now(),
                              user: data.user_id,
                              user_username: data.username,
                              emoji: data.emoji,
                              created_at: new Date().toISOString(),
                            },
                          ],
                        };
                      } else if (data.action === 'remove') {
                        return {
                          ...msg,
                          reactions: currentReactions.filter(
                            (r) => !(r.user === data.user_id && r.emoji === data.emoji)
                          ),
                        };
                      }
                      return msg;
                    })
                    : page.results,
                })),
                pageParams: oldData.pageParams ?? [],
              };
            }
          );
          return;
        }

        // ── Read receipt ──────────────────────────────────────
        if (data.type === 'read_receipt') {
          if (typeof currentUserId !== 'number') return

          type MessagesPage = { results: Message[]; next: string | null };
          type MessagesData = { pages: MessagesPage[]; pageParams?: unknown[] };
          const readerId = data.user_id as number
          const expected = typeof expectedReaders === 'number' ? Math.max(expectedReaders, 1) : 1

          queryClient.setQueryData<MessagesData | undefined>(['messages', conversationId], (oldData) => {
            if (!oldData || !Array.isArray(oldData.pages)) return oldData;
            return {
              pages: oldData.pages.map((page) => ({
                ...page,
                results: Array.isArray(page.results)
                  ? page.results.map((msg: Message) => {
                    if (msg.id !== data.message_id) return msg
                    if (msg.sender !== currentUserId) return msg
                    if (readerId === currentUserId) return msg

                    const existing = Array.isArray(msg.read_by_user_ids) ? msg.read_by_user_ids : []
                    const nextReaders = existing.includes(readerId) ? existing : [...existing, readerId]
                    const nextCount = nextReaders.length
                    const existingDelivered = Array.isArray(msg.delivered_by_user_ids) ? msg.delivered_by_user_ids : []
                    const nextDelivered = existingDelivered.includes(readerId) ? existingDelivered : [...existingDelivered, readerId]
                    const nextDeliveredCount = nextDelivered.length
                    return {
                      ...msg,
                      read_by_user_ids: nextReaders,
                      read_by_count: nextCount,
                      delivered_by_user_ids: nextDelivered,
                      delivered_by_count: nextDeliveredCount,
                      is_delivered: nextDeliveredCount >= expected,
                      is_read: nextCount >= expected,
                    }
                  })
                  : page.results,
              })),
              pageParams: oldData.pageParams ?? [],
            };
          })
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          return;
        }

        if (data.type === 'delivery_receipt') {
          if (typeof currentUserId !== 'number') return

          type MessagesPage = { results: Message[]; next: string | null };
          type MessagesData = { pages: MessagesPage[]; pageParams?: unknown[] };
          const delivererId = data.user_id as number
          const expected = typeof expectedReaders === 'number' ? Math.max(expectedReaders, 1) : 1

          queryClient.setQueryData<MessagesData | undefined>(['messages', conversationId], (oldData) => {
            if (!oldData || !Array.isArray(oldData.pages)) return oldData;
            return {
              pages: oldData.pages.map((page) => ({
                ...page,
                results: Array.isArray(page.results)
                  ? page.results.map((msg: Message) => {
                    if (msg.id !== data.message_id) return msg
                    if (msg.sender !== currentUserId) return msg
                    if (delivererId === currentUserId) return msg

                    const existing = Array.isArray(msg.delivered_by_user_ids) ? msg.delivered_by_user_ids : []
                    const nextDeliverers = existing.includes(delivererId) ? existing : [...existing, delivererId]
                    const nextCount = nextDeliverers.length
                    return {
                      ...msg,
                      delivered_by_user_ids: nextDeliverers,
                      delivered_by_count: nextCount,
                      is_delivered: nextCount >= expected,
                    }
                  })
                  : page.results,
              })),
              pageParams: oldData.pageParams ?? [],
            };
          })
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          return;
        }

        if (data.type === 'message_read') {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          return;
        }

        if (data.type === 'message_delivered') {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          return;
        }

        // ── Delete message ────────────────────────────────────
        if (data.type === 'delete_message') {
          type MessagesPage = { results: Message[]; next: string | null };
          type MessagesData = { pages: MessagesPage[]; pageParams?: unknown[] };
          queryClient.setQueryData<MessagesData | undefined>(
            ['messages', conversationId],
            (oldData) => {
              if (!oldData || !Array.isArray(oldData.pages)) return oldData;
              return {
                pages: oldData.pages.map((page) => ({
                  ...page,
                  results: Array.isArray(page.results)
                    ? page.results.map((msg: Message) =>
                      msg.id === data.message_id ? { ...msg, is_deleted: true, content: null, file_url: null } : msg
                    )
                    : page.results,



                })),
                pageParams: oldData.pageParams ?? [],
              };
            }
          );
          return;
        }

        // ── Edit message ──────────────────────────────────────
        if (data.type === 'edit_message') {
          type MessagesPage = { results: Message[]; next: string | null };
          type MessagesData = { pages: MessagesPage[]; pageParams?: unknown[] };
          queryClient.setQueryData<MessagesData | undefined>(
            ['messages', conversationId],
            (oldData) => {
              if (!oldData || !Array.isArray(oldData.pages)) return oldData;
              return {
                pages: oldData.pages.map((page) => ({
                  ...page,
                  results: Array.isArray(page.results)
                    ? page.results.map((msg: Message) =>
                      msg.id === data.message_id
                        ? { ...msg, content: data.content, edited_at: data.edited_at }
                        : msg
                    )
                    : page.results,
                })),
                pageParams: oldData.pageParams ?? [],
              };
            }
          );
          return;
        }
      } catch (err) {
        console.error('Chat WebSocket message error:', err);
      }
    }
  });

  useEffect(() => {
    readyStateRef.current = readyState
  }, [readyState])

  useEffect(() => {
    if (readyState !== ReadyState.OPEN) return

    const deliveredIds = Array.from(pendingDeliveredRef.current)
    const readIds = Array.from(pendingReadRef.current)
    pendingDeliveredRef.current.clear()
    pendingReadRef.current.clear()

    if (deliveredIds.length) {
      sendMessage(JSON.stringify({ type: 'delivered', message_ids: deliveredIds }))
    }
    if (readIds.length) {
      sendMessage(JSON.stringify({ type: 'mark_read', message_ids: readIds }))
    }
  }, [readyState, sendMessage])

  useEffect(() => {
    return () => {
      if (ackFlushTimerRef.current) {
        clearTimeout(ackFlushTimerRef.current)
        ackFlushTimerRef.current = null
      }
    }
  }, [])

  const markRead = useCallback((messageIds: number[]) => {
    if (readyState !== ReadyState.OPEN) return false
    if (!Array.isArray(messageIds) || messageIds.length === 0) return false
    for (const id of messageIds) {
      if (!readAckRef.current.has(id)) {
        readAckRef.current.add(id)
        pendingReadRef.current.add(id)
      }
    }
    if (!ackFlushTimerRef.current) {
      ackFlushTimerRef.current = setTimeout(() => {
        ackFlushTimerRef.current = null
        if (readyStateRef.current !== ReadyState.OPEN) return

        const deliveredIds = Array.from(pendingDeliveredRef.current)
        const readIds = Array.from(pendingReadRef.current)
        pendingDeliveredRef.current.clear()
        pendingReadRef.current.clear()

        if (deliveredIds.length) {
          sendMessage(JSON.stringify({ type: 'delivered', message_ids: deliveredIds }))
        }
        if (readIds.length) {
          sendMessage(JSON.stringify({ type: 'mark_read', message_ids: readIds }))
        }
      }, 150)
    }
    return true
  }, [readyState, sendMessage])

  const sendTypingStatus = useCallback((isTyping: boolean) => {
    if (readyState === ReadyState.OPEN) {
      sendMessage(JSON.stringify({
        type: 'typing_status',
        is_typing: isTyping
      }));
    }
  }, [readyState, sendMessage]);

  // ── Heartbeat ───────────────────────────────────────
  // Keep connection alive every 30s
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (readyState === ReadyState.OPEN) {
      interval = setInterval(() => {
        sendMessage(JSON.stringify({ type: 'heartbeat' }));
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [readyState, sendMessage]);



  /**
   * Call this on every input change event.
   * Uses a single debounced timer — avoids creating multiple overlapping timers
   * (which was the original bug: each keystroke created a new timer, resulting in
   * multiple "typing=false" signals being sent after each key press).
   */
  const handleTyping = useCallback(() => {
    sendTypingStatus(true);

    // Clear any existing timer so only the last keystroke schedules the "stop"
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = setTimeout(() => {
      sendTypingStatus(false);
      typingTimerRef.current = null;
    }, 3000);
  }, [sendTypingStatus]);

  return {
    typingUsers,
    handleTyping,
    sendTypingStatus,
    markRead,
    readyState,
    lastMessage: lastJsonMessage
  };
}
