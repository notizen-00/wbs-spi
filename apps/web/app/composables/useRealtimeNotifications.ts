import { io, type Socket } from 'socket.io-client';
import type { NotificationItem, User } from '@wbs/contracts';
import type { Ref } from 'vue';

export function useRealtimeNotifications(user: Ref<User | null>, panelOpen: Ref<boolean>) {
  const notifications = ref<NotificationItem[]>([]),
    unreadCount = ref(0),
    connectionStatus = ref<'offline' | 'connecting' | 'connected'>('offline'),
    announcement = ref('');
  let socket: Socket | undefined;
  let generation = 0;
  let disposed = false;
  let loaded = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const received = new Set<string>();
  async function refresh() {
    const owner = user.value?.id,
      revision = generation;
    if (!owner) return;
    try {
      const rows = await $fetch<NotificationItem[]>('/api/v1/notifications');
      if (disposed || revision !== generation || user.value?.id !== owner) return;
      const newCount = loaded ? rows.filter((row) => !received.has(row.id)).length : 0;
      const merged = new Map(notifications.value.map((item) => [item.id, item]));
      for (const row of rows) {
        merged.set(row.id, row);
        received.add(row.id);
      }
      notifications.value = [...merged.values()]
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .slice(0, 30);
      loaded = true;
      if (newCount && !panelOpen.value) {
        unreadCount.value += newCount;
        announcement.value = 'Ada pemberitahuan baru di portal WBS.';
      }
    } catch {
      /* Durable history will be fetched again on reconnect or when opening the panel. */
    }
  }
  function markSeen() {
    unreadCount.value = 0;
    announcement.value = '';
  }
  function stop() {
    generation++;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
    loaded = false;
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = undefined;
    connectionStatus.value = 'offline';
  }
  watch(
    () => user.value?.id,
    async (id) => {
      stop();
      received.clear();
      notifications.value = [];
      markSeen();
      if (!id || disposed) return;
      socket = io('/notifications', {
        path: '/api/v1/socket.io',
        transports: ['websocket'],
        withCredentials: true,
        autoConnect: false,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
      });
      connectionStatus.value = 'connecting';
      socket.on('connect', () => {
        connectionStatus.value = 'connected';
        void refresh();
      });
      socket.on('connect_error', (error) => {
        connectionStatus.value = 'offline';
        if (error.data?.code === 'REALTIME_UNAVAILABLE' && !retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = undefined;
            if (user.value?.id === id) socket?.connect();
          }, 5000);
        }
      });
      socket.on('disconnect', () => {
        connectionStatus.value = 'offline';
      });
      socket.on('notifications:sync', () => {
        void refresh();
      });
      socket.on('notification:new', (item: NotificationItem) => {
        if (
          user.value?.id !== id ||
          !item ||
          typeof item.id !== 'string' ||
          typeof item.message !== 'string' ||
          !Number.isFinite(Date.parse(item.created_at)) ||
          received.has(item.id)
        )
          return;
        received.add(item.id);
        notifications.value = [item, ...notifications.value.filter((n) => n.id !== item.id)]
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .slice(0, 30);
        if (!panelOpen.value) {
          unreadCount.value++;
          announcement.value = item.title || 'Ada pemberitahuan baru di portal WBS.';
        }
      });
      socket.connect();
      await refresh();
    },
    { immediate: true },
  );
  watch(panelOpen, (open) => {
    if (open) markSeen();
  });
  onUnmounted(() => {
    disposed = true;
    stop();
    received.clear();
    notifications.value = [];
  });
  return { notifications, unreadCount, connectionStatus, announcement, refresh, markSeen };
}
