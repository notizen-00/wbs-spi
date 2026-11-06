<script setup lang="ts">
import {
  Bell,
  CheckCheck,
  X,
  FileText,
  MessageSquare,
  ShieldCheck,
  ClipboardCheck,
  PauseCircle,
  RefreshCw,
  KeyRound,
  ArrowUpRight,
  LoaderCircle,
} from '@lucide/vue';
import type { NotificationItem } from '@wbs/contracts';
import { formatDateTime } from '../utils/date-time';
const props = defineProps<{
  items: NotificationItem[];
  unreadCount: number;
  connectionStatus: string;
  loading: boolean;
  marking: boolean;
  error: string;
}>();
const emit = defineEmits<{ close: []; open: [item: NotificationItem]; markAll: []; refresh: [] }>();
const dialog = ref<HTMLElement | null>(null),
  filter = ref('all');
const shown = computed(() => props.items.filter((item) => filter.value === 'all' || !item.read_at));
function icon(kind?: string) {
  if (['CLARIFY', 'RESPOND'].includes(kind || '')) return MessageSquare;
  if (
    [
      'DECIDE',
      'PROPOSE_ASSIGNMENT',
      'PROPOSE_RESULT',
      'PROPOSE_CLOSURE',
      'PROPOSE_REOPEN',
    ].includes(kind || '')
  )
    return ShieldCheck;
  if (['COMPLETED', 'EXECUTE', 'REVIEW_EXECUTION'].includes(kind || '')) return ClipboardCheck;
  if (kind === 'SUSPEND') return PauseCircle;
  if (['RESUME', 'REQUEST_REOPEN'].includes(kind || '')) return RefreshCw;
  if (['VERIFY', 'RESET'].includes(kind || '')) return KeyRound;
  return FileText;
}
let priorFocus: HTMLElement | null = null,
  priorOverflow = '';
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
  if (event.key !== 'Tab') return;
  const targets = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]') || [],
  );
  const first = targets[0],
    last = targets.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
onMounted(async () => {
  priorFocus = document.activeElement as HTMLElement;
  priorOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', keydown);
  await nextTick();
  dialog.value?.querySelector<HTMLElement>('[aria-label="Tutup notifikasi"]')?.focus();
});
onUnmounted(() => {
  document.body.style.overflow = priorOverflow;
  document.removeEventListener('keydown', keydown);
  if (priorFocus?.isConnected) priorFocus.focus();
});
</script>
<template>
  <Teleport to="body"
    ><div class="notification-backdrop" @click.self="emit('close')">
      <section
        ref="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-title"
        class="notification-panel notification-inbox"
      >
        <header class="inbox-heading">
          <div class="inbox-heading-icon"><Bell :size="22" /></div>
          <div>
            <h2 id="notifications-title">
              Notifikasi <span v-if="unreadCount">{{ unreadCount }}</span>
            </h2>
            <p>
              {{ unreadCount ? `${unreadCount} belum dibaca` : 'Semua notifikasi sudah dibaca' }}
            </p>
          </div>
          <button
            class="icon-button inbox-close"
            aria-label="Tutup notifikasi"
            @click="emit('close')"
          >
            <X :size="21" />
          </button>
        </header>
        <div class="inbox-controls">
          <div class="inbox-tabs">
            <button :aria-pressed="filter === 'all'" @click="filter = 'all'">Semua</button
            ><button :aria-pressed="filter === 'unread'" @click="filter = 'unread'">
              Belum dibaca
            </button>
          </div>
          <button
            class="inbox-mark"
            :disabled="marking || !unreadCount"
            aria-label="Tandai semua dibaca"
            title="Tandai semua dibaca"
            @click="emit('markAll')"
          >
            <LoaderCircle v-if="marking" class="spin" :size="18" /><CheckCheck
              v-else
              :size="18"
            /><span>Tandai semua dibaca</span>
          </button>
        </div>
        <div v-if="error" class="inbox-error" role="alert">
          {{ error }}<button @click="emit('refresh')">Coba lagi</button>
        </div>
        <div class="inbox-list" :aria-busy="loading">
          <div v-if="loading && !items.length" class="inbox-empty" role="status">
            <LoaderCircle class="spin" />
            <p>Memuat notifikasi…</p>
          </div>
          <div v-else-if="!shown.length" class="inbox-empty">
            <CheckCheck :size="36" />
            <h3>
              {{
                filter === 'unread' ? 'Tidak ada notifikasi belum dibaca' : 'Belum ada notifikasi'
              }}
            </h3>
            <p>Pembaruan laporan dan akun Anda akan muncul di sini.</p>
          </div>
          <button
            v-for="item in shown"
            :key="item.id"
            class="inbox-item"
            :class="{ unread: !item.read_at }"
            @click="emit('open', item)"
          >
            <span class="inbox-type" :class="item.kind?.toLowerCase()"
              ><component :is="icon(item.kind)" :size="20" /></span
            ><span class="inbox-copy"
              ><span class="inbox-title"
                >{{ item.title || 'Pembaruan laporan'
                }}<span
                  v-if="!item.read_at"
                  class="inbox-dot"
                  aria-label="Belum dibaca"
                ></span></span
              ><span v-if="item.subject" class="inbox-subject">{{ item.subject }}</span
              ><span class="inbox-message">{{ item.message }}</span
              ><time :datetime="item.created_at">{{ formatDateTime(item.created_at) }}</time
              ><span class="inbox-link"
                >Buka {{ item.targetPath?.startsWith('/reports') ? 'perkara' : 'halaman terkait'
                }}<ArrowUpRight :size="13" /></span
            ></span>
          </button>
        </div>
        <footer class="inbox-footer">
          <span :class="{ online: connectionStatus === 'connected' }" class="inbox-connection">{{
            connectionStatus === 'connected'
              ? 'Pembaruan langsung aktif'
              : connectionStatus === 'connecting'
                ? 'Menghubungkan…'
                : 'Koneksi langsung terputus'
          }}</span
          ><span>30 notifikasi terbaru</span>
        </footer>
      </section>
    </div></Teleport
  >
</template>
<style scoped>
.notification-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: #17372422;
}
.notification-inbox {
  position: absolute;
  right: 30px;
  top: 76px;
  width: 460px;
  max-width: calc(100vw - 40px);
  max-height: calc(100dvh - 100px);
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  border-radius: 17px;
  border: 1px solid #dbe3d4;
  background: #fff;
  box-shadow: 0 20px 65px #18342430;
}
.notification-inbox p {
  padding: 0;
  border: 0;
}
.inbox-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px;
  flex-shrink: 0;
}
.inbox-heading-icon {
  width: 43px;
  height: 43px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  color: #3c664b;
  background: #edf3e8;
}
.inbox-heading h2 {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 19px;
  color: #283f30;
}
.inbox-heading h2 span {
  font-size: 11px;
  background: #2e6445;
  color: white;
  padding: 4px 7px;
  border-radius: 9px;
}
.inbox-heading p {
  font-size: 11px;
  color: #77826d;
  margin: 5px 0 0;
}
.inbox-close {
  margin-left: auto;
}
.inbox-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px 16px;
  border-bottom: 1px solid #e6ebdf;
  flex-shrink: 0;
}
.inbox-tabs {
  display: flex;
  gap: 5px;
}
.inbox-tabs button {
  border: 0;
  padding: 8px 10px;
  background: transparent;
  color: #79846d;
  border-radius: 7px;
  font-size: 11px;
  cursor: pointer;
}
.inbox-tabs button[aria-pressed='true'] {
  background: #edf3e8;
  color: #356143;
  font-weight: 650;
}
.inbox-mark {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  background: transparent;
  border: 0;
  padding: 7px 0;
  color: #3e6549;
  font-size: 10px;
  cursor: pointer;
}
.inbox-mark:disabled {
  opacity: 0.45;
  cursor: default;
}
.inbox-list {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  flex: 1;
}
.inbox-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding: 20px;
  border: 0;
  border-bottom: 1px solid #edf0e8;
  text-align: left;
  background: white;
  cursor: pointer;
  color: inherit;
}
.inbox-item.unread {
  background: #f6f9f2;
}
.inbox-item:hover {
  background: #edf3e6;
}
.inbox-type {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: #edf1e7;
  color: #6a8056;
  border-radius: 11px;
}
.inbox-type.clarify,
.inbox-type.suspend {
  color: #99702c;
  background: #fcf0dc;
}
.inbox-type.completed {
  background: #e2f0e6;
  color: #35774b;
}
.inbox-type.decide,
.inbox-type.propose_assignment {
  background: #eaf0f8;
  color: #526f97;
}
.inbox-copy {
  min-width: 0;
  flex: 1;
}
.inbox-title {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.5;
  color: #304a36;
}
.inbox-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #628443;
  flex-shrink: 0;
}
.inbox-subject,
.inbox-message,
.inbox-copy time {
  display: block;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.inbox-subject {
  font-size: 10px;
  color: #6a775e;
  margin-top: 5px;
}
.inbox-message {
  font-size: 12px;
  color: #66735b;
  margin-top: 6px;
}
.inbox-copy time {
  font-size: 10px;
  color: #8a937e;
  margin-top: 9px;
}
.inbox-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: #53734b;
  margin-top: 8px;
}
.inbox-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid #e4e9dd;
  font-size: 9px;
  color: #8b947f;
  flex-shrink: 0;
}
.inbox-connection {
  color: #9a7c4e;
}
.inbox-connection.online {
  color: #5b7c48;
}
.inbox-empty {
  text-align: center;
  padding: 48px 24px;
  color: #7c8e6a;
}
.inbox-empty svg {
  margin: 0 auto 15px;
}
.inbox-empty h3 {
  font-size: 14px;
}
.inbox-empty p {
  font-size: 12px;
  line-height: 1.8;
  margin-top: 10px;
}
.inbox-error {
  padding: 12px 20px;
  color: #975346;
  background: #fff5ef;
  font-size: 12px;
}
.inbox-error button {
  display: block;
  margin-top: 8px;
  background: none;
  border: none;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
@media (max-width: 760px) {
  .notification-inbox {
    position: fixed;
    inset: 0;
    width: 100%;
    max-width: none;
    height: 100dvh;
    max-height: none;
    border: 0;
    border-radius: 0;
  }
  .inbox-heading {
    padding: max(20px, env(safe-area-inset-top)) 20px 20px;
  }
  .inbox-footer {
    padding-bottom: max(18px, env(safe-area-inset-bottom));
  }
  .inbox-list {
    flex: 1;
  }
}
</style>
