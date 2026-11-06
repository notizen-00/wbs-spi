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
  const loading = ref(false),
    marking = ref(false),
    error = ref('');
  let refreshNumber = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const received = new Set<string>();
  async function refresh() {
    const owner = user.value?.id,
      revision = generation,
      request = ++refreshNumber;
    if (!owner) return;
    loading.value = true;
    try {
      const [rows, summary] = await Promise.all([
        $fetch<NotificationItem[]>('/api/v1/notifications'),
        $fetch<{ unreadCount: number }>('/api/v1/notifications/summary').catch(() => null),
      ]);
      if (
        disposed ||
        revision !== generation ||
        user.value?.id !== owner ||
        request !== refreshNumber
      )
        return;
      notifications.value = rows;
      rows.forEach((row) => received.add(row.id));
      unreadCount.value =
        typeof summary?.unreadCount === 'number'
          ? summary.unreadCount
          : rows.filter((row) => !row.read_at).length;
      error.value = '';
    } catch {
      if (revision === generation && request === refreshNumber)
        error.value = 'Notifikasi tidak dapat dimuat. Coba lagi.';
    } finally {
      if (request === refreshNumber) loading.value = false;
    }
  }
  async function markRead(item: NotificationItem) {
    if (item.read_at) return true;
    const owner = user.value?.id,
      revision = generation;
    if (!owner) return false;
    try {
      await $fetch<{ unreadCount: number }>('/api/v1/notifications/' + item.id + '/read', {
        method: 'PATCH',
        body: {},
      });
      if (revision !== generation || user.value?.id !== owner) return false;
      refreshNumber++;
      notifications.value = notifications.value.map((row) =>
        row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row,
      );
      unreadCount.value = Math.max(0, unreadCount.value - 1);
      await refresh();
      return true;
    } catch {
      if (revision === generation)
        error.value = 'Status baca gagal disimpan. Anda tetap dapat membuka halaman tujuan.';
      return false;
    }
  }
  async function markAllRead() {
    if (marking.value || !user.value) return;
    const owner = user.value.id,
      revision = generation;
    marking.value = true;
    error.value = '';
    try {
      const result = await $fetch<{ before: string; readAt: string; unreadCount: number }>(
        '/api/v1/notifications/read-all',
        { method: 'PATCH', body: { before: new Date().toISOString() } },
      );
      if (revision !== generation || user.value?.id !== owner) return;
      refreshNumber++;
      notifications.value = notifications.value.map((row) =>
        !row.read_at && Date.parse(row.created_at) <= Date.parse(result.before)
          ? { ...row, read_at: result.readAt }
          : row,
      );
      unreadCount.value = result.unreadCount;
      announcement.value = 'Semua notifikasi telah ditandai dibaca.';
      await refresh();
    } catch {
      if (revision === generation) error.value = 'Gagal menandai notifikasi. Silakan coba lagi.';
    } finally {
      if (revision === generation) marking.value = false;
    }
  }
  function stop() {
    generation++;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
    unreadCount.value = 0;
    loading.value = false;
    marking.value = false;
    error.value = '';
    announcement.value = '';
    refreshNumber++;
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
          !Number.isFinite(Date.parse(item.created_at))
        )
          return;
        const previous = notifications.value.find((row) => row.id === item.id);
        if (!previous && !item.read_at) unreadCount.value++;
        else if (previous && !previous.read_at && item.read_at)
          unreadCount.value = Math.max(0, unreadCount.value - 1);
        received.add(item.id);
        notifications.value = [item, ...notifications.value.filter((n) => n.id !== item.id)]
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .slice(0, 30);
        if (!previous && !panelOpen.value) {
          announcement.value = item.title || 'Ada pemberitahuan baru di portal WBS.';
        }
      });
      socket.connect();
      await refresh();
    },
    { immediate: true },
  );
  watch(panelOpen, (open) => {
    if (open) error.value = '';
  });
  onUnmounted(() => {
    disposed = true;
    stop();
    received.clear();
    notifications.value = [];
  });
  return {
    notifications,
    unreadCount,
    connectionStatus,
    announcement,
    refresh,
    markRead,
    markAllRead,
    loading,
    marking,
    error,
  };
}
