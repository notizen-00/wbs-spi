<script setup lang="ts">
import { formatDateTime } from './utils/date-time';
import {
  ShieldCheck,
  LayoutDashboard,
  Files,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Bell,
  ChevronRight,
  ChevronLeft,
  LogOut,
  LockKeyhole,
  BookOpen,
  HelpCircle,
  Check,
  Clock,
  FileText,
  MessageSquare,
  Menu,
  X,
  Eye,
  Save,
  Send,
  CheckCircle2,
  AlertCircle,
  UserRound,
  Mail,
  LoaderCircle,
} from '@lucide/vue';
import {
  stageLabels,
  type Report,
  type ReportPayload,
  type User,
  type NotificationItem,
} from '@wbs/contracts';
const { site, reloadSite } = useSiteConfiguration();
useHead({ title: () => `${site.value.appName} - ${site.value.institutionName}` });
const user = ref<User | null>(null),
  page = ref('dashboard'),
  auth = ref(''),
  busy = ref(false),
  loading = ref(false),
  error = ref(''),
  notice = ref(''),
  mobile = ref(false),
  reports = ref<Report[]>([]),
  selected = ref<Report | null>(null),
  showNotifications = ref(false);
const showTimeline = ref(true);
const submissionToken = ref('');
const submissionCaptcha = ref<{ reset: () => void } | null>(null);
const sessionReady = ref(false);
const publicAuthPage = ref(false);
const publicSection = ref('');
const demoGuide = ref<{ password: string | null } | null>(null);
const routePaths: Record<string, string> = {
  dashboard: '/dashboard',
  demo: '/demo',
  adminCategories: '/admin/categories',
  adminSettings: '/admin/settings',
  reports: '/reports',
  create: '/reports/new',
  guide: '/guide',
  privacy: '/privacy',
  help: '/help',
};
function setPath(path: string, replace = false) {
  if (!import.meta.client || (window.location.pathname === path && !window.location.search)) return;
  window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', path);
}
function openAuth(mode = 'login', replace = false) {
  page.value = 'dashboard';
  auth.value = mode;
  publicAuthPage.value = true;
  error.value = '';
  credentials.password = '';
  setPath(mode === 'register' ? '/register' : '/login', replace);
  window.scrollTo(0, 0);
}
async function openPublic(section = '', replace = false) {
  auth.value = '';
  publicAuthPage.value = false;
  publicSection.value = section;
  page.value = section === 'demo' && demoGuide.value ? 'demo' : 'dashboard';
  error.value = '';
  setPath(section ? `/${section}` : '/', replace);
  await nextTick();
  if (section && section !== 'tracking')
    document.getElementById(section)?.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}
async function applyPath(replace = true) {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/tracking') {
    await openPublic('tracking', replace);
    return;
  }
  if (path === '/demo' && demoGuide.value) {
    page.value = 'demo';
    setPath('/demo', replace);
    return;
  }
  if (!user.value) {
    if (path === '/login' || path === '/register') openAuth(path.slice(1), replace);
    else if (path === '/reports/new') await newReport();
    else if (['/', '/guide', '/privacy', '/help', '/tracking'].includes(path))
      await openPublic(path === '/' ? '' : path.slice(1), replace);
    else openAuth('login', replace);
    return;
  }
  if (path.startsWith('/reports/') && path !== '/reports/new') {
    try {
      const report = await api<Report>(path);
      await openReport(report);
    } catch (failure) {
      navigate('reports', true);
      error.value = message(failure);
    }
    return;
  }
  const target = Object.keys(routePaths).find((key) => routePaths[key] === path) ?? 'dashboard';
  navigate(target, replace);
}
function popstate() {
  if (sessionReady.value) void applyPath();
}
const {
  notifications,
  unreadCount,
  connectionStatus,
  announcement,
  refresh: refreshNotifications,
  markRead,
  markAllRead,
  loading: notificationsLoading,
  marking: markingNotifications,
  error: notificationError,
} = useRealtimeNotifications(user, showNotifications);
const credentials = reactive({ name: '', email: '', password: '' });
const resetToken = ref('');
const recoveryKind = ref<'RESET' | 'VERIFY'>('RESET');
const workspace = ref<{ refresh: () => Promise<void> } | null>(null);
watch(auth, async (value) => {
  if (value) {
    await nextTick();
    document
      .querySelector<HTMLInputElement>('.public-auth-card input, [role="dialog"] input')
      ?.focus();
  }
});
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (['recovery', 'reset'].includes(auth.value))
      auth.value = publicAuthPage.value ? 'login' : '';
    mobile.value = false;
    showNotifications.value = false;
  }
  if (event.key === 'Tab' && ['recovery', 'reset'].includes(auth.value)) {
    const dialog = document.querySelector('[role="dialog"]');
    const elements = Array.from(
      dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href]') || [],
    );
    const first = elements[0],
      last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
}
onUnmounted(() => {
  window.removeEventListener('keydown', keydown);
  window.removeEventListener('popstate', popstate);
});
const empty = (): ReportPayload => ({
  title: '',
  category: '',
  subcategory: '',
  what: '',
  who: '',
  when: '',
  where: '',
  why: '',
  how: '',
  confidentiality: 'PROTECTED',
  evidenceReason: '',
});
const form = reactive<ReportPayload>(empty());
const confirmed = ref(false),
  response = ref(''),
  commandReason = ref('');
const categories = computed(() => site.value.categories);
const active = computed(() =>
  reports.value.filter((r) => !['DRAFT', 'COMPLETED', 'CLOSED'].includes(r.stage)),
);
const needsReply = computed(() =>
  reports.value.filter((r) => r.clarification && !r.clarification.response),
);
const date = formatDateTime;
const internal = computed(() => user.value && user.value.role !== 'REPORTER');
const initials = computed(() =>
  (user.value?.name || 'Tamu')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join(''),
);
async function api<T = any>(path: string, options: any = {}): Promise<T> {
  return (await $fetch<T>(`/api/v1${path}`, {
    timeout: 10000,
    retry: 0,
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })) as T;
}
function message(e: any) {
  return e?.data?.message || 'Tidak dapat terhubung ke layanan. Periksa koneksi dan coba lagi.';
}
async function run(fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await fn();
  } catch (e) {
    error.value = message(e);
  } finally {
    busy.value = false;
  }
}
async function load() {
  loading.value = true;
  try {
    reports.value = await api<Report[]>('/reports');
  } catch (e) {
    error.value = message(e);
  } finally {
    loading.value = false;
  }
}
watch(
  () => user.value?.role,
  () => {
    selected.value = null;
    Object.assign(form, empty());
    if (sessionReady.value) {
      if (user.value) navigate('dashboard', true);
      else void openPublic('', true);
    }
  },
);
function navigate(p: string, replace = false) {
  if (p === 'demo' && !demoGuide.value) p = 'dashboard';
  if (!user.value) {
    if (['guide', 'privacy', 'help'].includes(p)) void openPublic(p, replace);
    else openAuth('login', replace);
    return;
  }
  if (!internal.value && p === 'reports') {
    void openPublic('tracking', replace);
    return;
  }
  if (internal.value && ['create', 'guide', 'privacy', 'help'].includes(p)) p = 'dashboard';
  if (p.startsWith('admin') && user.value?.role !== 'SUPER_ADMIN') p = 'dashboard';
  if (user.value?.role === 'SUPER_ADMIN' && ['reports', 'detail'].includes(p)) p = 'dashboard';
  publicSection.value = '';
  page.value = p;
  mobile.value = false;
  error.value = '';
  notice.value = '';
  setPath(
    (p === 'detail' || p === 'create') && selected.value
      ? `/reports/${selected.value.id}`
      : (routePaths[p] ?? '/dashboard'),
    replace,
  );
}
async function newReport() {
  if (!user.value) {
    await run(async () => {
      user.value = await api<User>('/auth/guest', { method: 'POST', body: {} });
    });
    if (!user.value) return;
  }
  if (user.value.role !== 'REPORTER') return;
  selected.value = null;
  Object.assign(form, empty());
  confirmed.value = false;
  navigate('create');
}
async function login(captchaToken: string) {
  await run(async () => {
    user.value = await api<User>('/auth/login', {
      method: 'POST',
      body: { ...credentials, captchaToken },
    });
    credentials.password = '';
    auth.value = '';
    await load();
    navigate('dashboard', true);
  });
}
async function register(captchaToken: string) {
  await run(async () => {
    const result = await api('/auth/register', {
      method: 'POST',
      body: { ...credentials, captchaToken },
    });
    notice.value = result.message;
    openAuth('login', true);
    credentials.password = '';
  });
}
async function logout() {
  await run(async () => {
    await api('/auth/logout', { method: 'POST', body: {} });
    user.value = null;
    reports.value = [];
    selected.value = null;
    Object.assign(form, empty());
    notifications.value = [];
    await openPublic('', true);
  });
}
async function saveDraft() {
  if (selected.value?.stage === 'DRAFT') {
    selected.value = await api<Report>(`/reports/${selected.value.id}/draft`, {
      method: 'PATCH',
      body: { payload: form, expectedVersion: selected.value.version },
    });
  } else {
    selected.value = await api<Report>('/reports/drafts', {
      method: 'POST',
      body: { payload: form },
    });
  }
  await load();
}
async function save() {
  await run(async () => {
    await saveDraft();
    notice.value = 'Draf berhasil disimpan. Hanya Anda yang dapat mengaksesnya.';
  });
}
async function submit() {
  await run(async () => {
    if (
      [
        'title',
        'category',
        'subcategory',
        'when',
        'where',
        'what',
        'who',
        'why',
        'how',
        'evidenceReason',
      ].some((key) => !String(form[key as keyof ReportPayload] ?? '').trim())
    ) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      throw { data: { message: 'Lengkapi semua kolom wajib sebelum mengirim laporan.' } };
    }
    if (!confirmed.value)
      throw { data: { message: 'Konfirmasi kebenaran laporan terlebih dahulu.' } };
    if (!submissionToken.value)
      throw { data: { message: 'Selesaikan reCAPTCHA sebelum mengirim laporan.' } };
    await saveDraft();
    await api(`/reports/${selected.value!.id}/commands`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `submit-${selected.value!.id}-${selected.value!.version}` },
      body: {
        action: 'SUBMIT',
        captchaToken: submissionToken.value,
        expectedVersion: selected.value!.version,
        reason: 'Laporan dikirim oleh pelapor.',
      },
    });
    selected.value = await api<Report>(`/reports/${selected.value!.id}`);
    navigate('detail');
    await load();
    notice.value =
      'Laporan berhasil dikirim. Simpan nomor tiket rahasia Anda untuk monitoring tanpa login.';
  });
  if (submissionCaptcha.value) submissionCaptcha.value.reset();
  else submissionToken.value = '';
}
async function openReport(r: Report) {
  await run(async () => {
    selected.value = await api<Report>(`/reports/${r.id}`);
    if (selected.value.stage === 'DRAFT') {
      Object.assign(form, selected.value.payload);
      confirmed.value = false;
      navigate('create');
    } else navigate('detail');
  });
}
async function refreshSelected() {
  if (selected.value) {
    try {
      selected.value = await api<Report>('/reports/' + selected.value.id);
      await load();
    } catch {
      selected.value = null;
      navigate('reports');
      await load();
      notice.value = 'Akses perkara telah diperbarui.';
    }
  }
}
async function command(action: string) {
  await run(async () => {
    await api(`/reports/${selected.value!.id}/commands`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: {
        action,
        expectedVersion: selected.value!.version,
        reason: action === 'RESPOND' ? response.value : commandReason.value,
      },
    });
    selected.value = await api<Report>(`/reports/${selected.value!.id}`);
    response.value = '';
    commandReason.value = '';
    await load();
    notice.value = 'Tindakan berhasil disimpan.';
  });
}
async function toggleNotifications() {
  showNotifications.value = !showNotifications.value;
  if (showNotifications.value && user.value) await refreshNotifications();
}
async function openNotification(item: NotificationItem) {
  await markRead(item);
  showNotifications.value = false;
  if (item.kind === 'VERIFY' || item.kind === 'RESET') {
    recoveryKind.value = item.kind;
    auth.value = 'recovery';
    return;
  }
  const target = item.targetPath || '/dashboard';
  const report = /^\/reports\/([a-f0-9-]{36})$/i.exec(target);
  if (report) {
    await openReport({ id: report[1] } as Report);
    return;
  }
  const context: Record<string, string> = {
    '/reports': 'reports',
    '/help': 'help',
    '/dashboard': 'dashboard',
    '/admin/settings': 'adminSettings',
    '/admin/categories': 'adminCategories',
  };
  navigate(context[target] || 'dashboard');
}
onMounted(async () => {
  await reloadSite().catch(() => {});
  window.addEventListener('keydown', keydown);
  window.addEventListener('popstate', popstate);
  const query = new URLSearchParams(window.location.search);
  const reset = query.get('reset'),
    verify = query.get('verify');
  if (reset || verify) setPath('/login', true);
  try {
    user.value = await api<User>('/me');
    await load();
  } catch (e: any) {
    if (e?.statusCode !== 401) error.value = message(e);
  }
  demoGuide.value = await $fetch<{ password: string | null }>('/api/v1/public/demo-guide', {
    timeout: 3000,
    retry: 0,
  }).catch(() => null);
  sessionReady.value = true;
  const startupError = error.value;
  await applyPath();
  if (startupError) error.value = startupError;
  if (reset) {
    resetToken.value = reset;
    auth.value = 'reset';
  }
  if (verify)
    await run(async () => {
      const r = await api('/auth/verify', { method: 'POST', body: { token: verify } });
      notice.value = r.message;
    });
});
</script>

<template>
  <div
    :class="[user && internal ? 'shell' : 'public-shell', { 'reporter-page': user && !internal }]"
  >
    <div v-if="!sessionReady" class="session-loading" role="status">
      <LoaderCircle class="spin" :size="25" />
      <p>Memuat portal WBS…</p>
    </div>
    <DemoGuide
      v-else-if="page === 'demo' && demoGuide"
      :password="demoGuide.password"
      @home="user ? navigate('dashboard') : openPublic()"
      @login="user ? navigate('dashboard') : openAuth()"
    />
    <PublicLanding
      v-else-if="!user || publicSection === 'tracking' || (!internal && page === 'dashboard')"
      :demo-available="!!demoGuide"
      :service-error="error"
      :auth-page="publicAuthPage"
      :tracking-page="!publicAuthPage && publicSection === 'tracking'"
      @login="newReport()"
      @report="newReport()"
      @home="openPublic()"
      @section="openPublic"
    >
      <template #auth
        ><PublicAuthForm
          :mode="auth === 'register' ? 'register' : 'login'"
          :credentials="credentials"
          :busy="busy"
          :error="error"
          :notice="notice"
          @submit="
            (captchaToken: string) =>
              auth === 'register' ? register(captchaToken) : login(captchaToken)
          "
          @mode="openAuth"
          @recovery="
            auth = 'recovery';
            error = '';
          "
      /></template>
    </PublicLanding>
    <template v-else>
      <div v-if="mobile && internal" class="backdrop" @click="mobile = false"></div>
      <aside v-if="internal" class="sidebar" :class="{ open: mobile }">
        <a href="#" class="brand" @click.prevent="navigate('dashboard')"><SiteBrand /></a>
        <button
          class="sidebar-close icon-button"
          aria-label="Tutup navigasi"
          @click="mobile = false"
        >
          <X />
        </button>
        <div class="workspace-label">PORTAL {{ internal ? 'INTERNAL' : 'PELAPOR' }}</div>
        <nav aria-label="Menu utama">
          <button :class="{ active: page === 'dashboard' }" @click="navigate('dashboard')">
            <LayoutDashboard :size="19" />Dashboard
          </button>
          <template v-if="user?.role === 'SUPER_ADMIN'"
            ><button
              :class="{ active: page === 'adminCategories' }"
              @click="navigate('adminCategories')"
            >
              <Files :size="19" />Bidang laporan</button
            ><button
              :class="{ active: page === 'adminSettings' }"
              @click="navigate('adminSettings')"
            >
              <ShieldCheck :size="19" />Pengaturan situs
            </button></template
          >
          <button
            v-if="user?.role !== 'SUPER_ADMIN'"
            :class="{ active: ['reports', 'detail', 'create'].includes(page) }"
            @click="navigate('reports')"
          >
            <Files :size="19" />{{ internal ? 'Antrean perkara' : 'Laporan saya'
            }}<span v-if="user" class="count">{{ reports.length }}</span>
          </button>
          <button v-if="!internal" :class="{ active: page === 'guide' }" @click="navigate('guide')">
            <BookOpen :size="19" />Panduan pelaporan<ArrowUpRight class="nav-arrow" :size="15" />
          </button>
          <button v-if="!internal" @click="openPublic('tracking')">
            <Clock :size="19" />Monitoring aduan
          </button>
        </nav>
        <div class="sidebar-bottom">
          <div v-if="!internal" class="private-note">
            <div class="private-note-icon"><LockKeyhole :size="19" /></div>
            <strong>Ruang aman untuk bersuara.</strong>
            <p>Identitas dan laporan Anda dibatasi untuk pihak yang berwenang.</p>
            <button @click="navigate('privacy')">
              Tentang kerahasiaan <ArrowRight :size="14" />
            </button>
          </div>
          <div v-if="internal" class="private-note">
            <strong>Akses sesuai kewenangan</strong>
            <p>
              Perkara tersedia berdasarkan penugasan aktif. Jaga kerahasiaan informasi dan catat
              setiap tindakan pada perkara.
            </p>
          </div>
          <button v-if="!internal" class="help-link" @click="navigate('help')">
            <HelpCircle :size="18" />Pusat bantuan<ArrowUpRight :size="15" />
          </button>
          <div class="institution">
            <span class="uni-mark">U</span
            ><span>Universitas Jember<small>Integritas untuk masa depan.</small></span>
          </div>
        </div>
      </aside>
      <div class="main-wrapper">
        <header v-if="!internal" class="reporter-header">
          <a href="/" class="reporter-brand" @click.prevent="openPublic()"
            ><SiteBrand logo-only
          /></a>
          <nav aria-label="Navigasi pelaporan">
            <a href="/" @click.prevent="openPublic()">Beranda</a>
            <a
              href="/reports/new"
              @click.prevent="newReport()"
              :aria-current="page === 'create' ? 'page' : undefined"
              >Laporkan</a
            >
            <a href="/tracking" @click.prevent="openPublic('tracking')">Monitoring aduan</a>
          </nav>
        </header>
        <header v-else class="topbar">
          <div class="breadcrumb">
            <button
              class="mobile-toggle icon-button"
              aria-label="Buka navigasi"
              @click="mobile = true"
            >
              <Menu /></button
            ><span>Portal {{ internal ? 'internal' : 'pelapor' }}</span
            ><ChevronRight :size="14" /><strong>{{
              page === 'dashboard'
                ? 'Dashboard'
                : page === 'adminCategories'
                  ? 'Bidang laporan'
                  : page === 'adminSettings'
                    ? 'Pengaturan situs'
                    : page === 'create'
                      ? 'Buat laporan'
                      : page === 'detail'
                        ? 'Detail laporan'
                        : page === 'reports'
                          ? internal
                            ? 'Antrean perkara'
                            : 'Laporan saya'
                          : page === 'guide'
                            ? 'Panduan'
                            : page === 'privacy'
                              ? 'Kerahasiaan'
                              : 'Bantuan'
            }}</strong>
          </div>
          <div class="header-right">
            <span class="secure-label"><span></span>Koneksi privat</span
            ><button
              class="icon-button notification-button"
              aria-haspopup="dialog"
              :aria-label="unreadCount ? `Notifikasi, ${unreadCount} pembaruan baru` : 'Notifikasi'"
              :aria-expanded="showNotifications"
              @click="toggleNotifications"
            >
              <Bell :size="20" /><span v-if="unreadCount" class="notification-count">{{
                unreadCount > 99 ? '99+' : unreadCount
              }}</span></button
            ><span class="header-divider"></span
            ><template v-if="user"
              ><span class="avatar">{{ initials }}</span
              ><span class="profile-name"
                >{{ user.name
                }}<small>{{ internal ? 'Petugas internal' : 'Pelapor terdaftar' }}</small></span
              ><button class="icon-button" aria-label="Keluar" @click="logout">
                <LogOut :size="17" /></button></template
            ><button v-else class="button small" @click="auth = 'login'">
              Masuk <ArrowRight :size="15" />
            </button>
          </div>
          <NotificationsPanel
            v-if="showNotifications && user"
            :items="notifications"
            :unread-count="unreadCount"
            :connection-status="connectionStatus"
            :loading="notificationsLoading"
            :marking="markingNotifications"
            :error="notificationError"
            @close="showNotifications = false"
            @open="openNotification"
            @mark-all="markAllRead"
            @refresh="refreshNotifications"
          />
          <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
        </header>
        <main id="main-content" :class="{ 'detail-page': page === 'detail' }">
          <div v-if="error" class="alert error" role="alert">
            <AlertCircle :size="19" /><span>{{ error }}</span
            ><button class="icon-button" aria-label="Tutup pesan" @click="error = ''">
              <X :size="16" />
            </button>
          </div>
          <div v-if="notice" class="alert success" role="status">
            <CheckCircle2 :size="19" /><span>{{ notice }}</span>
          </div>
          <SuperAdminPanel
            v-if="
              user?.role === 'SUPER_ADMIN' &&
              ['dashboard', 'adminCategories', 'adminSettings'].includes(page)
            "
            :section="
              page === 'adminCategories'
                ? 'categories'
                : page === 'adminSettings'
                  ? 'settings'
                  : 'overview'
            "
            @navigate="navigate"
          />
          <InternalDashboard
            v-else-if="internal && user && page === 'dashboard'"
            :user="user"
            :reports="reports"
            :loading="loading"
            @open="openReport"
            @queue="navigate('reports')"
          />
          <template v-else-if="page === 'dashboard'">
            <div class="page-heading">
              <div>
                <div class="eyebrow">WHISTLEBLOWING SYSTEM</div>
                <h1>
                  {{ user ? `Selamat datang, ${user.name.split(' ')[0]}.` : 'Suara Anda berarti.' }}
                </h1>
                <p>Sampaikan kepedulian Anda. Bersama, jaga integritas Universitas Jember.</p>
              </div>
              <span class="today">{{ date(new Date().toISOString()) }}</span>
            </div>
            <section class="hero">
              <div class="hero-content">
                <span class="hero-tag"><span></span>BERANI JUJUR, BERSAMA MENJAGA</span>
                <h2>Lingkungan berintegritas<br />dimulai dari suara Anda.</h2>
                <p>
                  Laporkan dugaan pelanggaran dengan aman dan bertanggung jawab. Setiap laporan
                  adalah langkah menuju perubahan.
                </p>
                <div class="hero-actions">
                  <button class="button white" @click="newReport">
                    <Plus :size="18" />Buat laporan<ArrowUpRight :size="17" /></button
                  ><button class="text-button light" @click="navigate('guide')">
                    Pelajari alur pelaporan<ArrowRight :size="16" />
                  </button>
                </div>
                <div class="hero-foot">
                  <ShieldCheck :size="15" />Akses terbatas<span>·</span
                  ><LockKeyhole :size="14" />Identitas terlindungi
                </div>
              </div>
              <div class="hero-art" aria-hidden="true">
                <div class="orbit orbit-one"></div>
                <div class="orbit orbit-two"></div>
                <div class="art-dot dot-one"></div>
                <div class="art-dot dot-two"></div>
                <div class="glass-card back-card"><span></span><span></span><span></span></div>
                <div class="shield-art"><ShieldCheck :size="102" :stroke-width="1.1" /></div>
                <div class="trust-chip">
                  <span><Check :size="14" /></span>Ruang aman untuk melapor
                </div>
              </div>
            </section>
            <div class="stats-grid">
              <article class="stat">
                <div><span>Total laporan</span><Files :size="19" /></div>
                <strong>{{ reports.length.toString().padStart(2, '0') }}</strong
                ><small>Seluruh laporan Anda</small>
              </article>
              <article class="stat">
                <div><span>Sedang diproses</span><Clock :size="19" /></div>
                <strong>{{ active.length.toString().padStart(2, '0') }}</strong
                ><small><i class="mini-dot green"></i>Dalam penanganan</small>
              </article>
              <article class="stat">
                <div><span>Perlu tanggapan</span><MessageSquare :size="19" /></div>
                <strong>{{ needsReply.length.toString().padStart(2, '0') }}</strong
                ><small><i class="mini-dot amber"></i>Permintaan klarifikasi</small>
              </article>
              <article class="stat">
                <div><span>Laporan selesai</span><CheckCircle2 :size="19" /></div>
                <strong>{{
                  reports
                    .filter((r) => ['COMPLETED', 'CLOSED'].includes(r.stage))
                    .length.toString()
                    .padStart(2, '0')
                }}</strong
                ><small>Penanganan telah berakhir</small>
              </article>
            </div>
            <div class="dashboard-columns">
              <section class="panel reports-panel">
                <div class="panel-title">
                  <div>
                    <h3>
                      Laporan terbaru <span class="subtle-count">{{ reports.length }}</span>
                    </h3>
                    <p>Pantau perkembangan laporan yang Anda sampaikan.</p>
                  </div>
                  <button class="text-button" @click="navigate('reports')">
                    Lihat semua<ArrowRight :size="15" />
                  </button>
                </div>
                <div v-if="loading" class="empty">
                  <LoaderCircle class="spin" />
                  <p>Memuat laporan…</p>
                </div>
                <template v-else-if="reports.length"
                  ><button
                    v-for="r in reports.slice(0, 4)"
                    :key="r.id"
                    class="report-row"
                    @click="openReport(r)"
                  >
                    <span class="report-icon"><FileText :size="20" /></span
                    ><span class="report-copy"
                      ><strong>{{ r.payload.title || 'Draf tanpa judul' }}</strong
                      ><small
                        >{{ r.number || 'Draf privat' }}<span>·</span>{{ date(r.updatedAt) }}</small
                      ></span
                    ><span class="badge" :class="r.stage.toLowerCase()">{{
                      stageLabels[r.stage]
                    }}</span
                    ><ChevronRight :size="17" /></button
                ></template>
                <div v-else class="empty">
                  <span class="empty-icon"><Files :size="29" :stroke-width="1.4" /></span>
                  <h4>{{ user ? 'Belum ada laporan' : 'Laporan Anda, dalam satu tempat' }}</h4>
                  <p>
                    {{
                      user
                        ? 'Laporan yang Anda buat akan tampil di sini.'
                        : 'Masuk untuk membuat laporan dan memantau perkembangannya.'
                    }}
                  </p>
                  <button class="text-button" @click="user ? newReport() : (auth = 'login')">
                    {{ user ? 'Buat laporan pertama' : 'Masuk ke akun' }}<ArrowRight :size="16" />
                  </button>
                </div>
                <div class="panel-footer">
                  <LockKeyhole :size="13" />{{
                    internal
                      ? 'Hanya perkara dengan akses aktif yang ditampilkan.'
                      : 'Hanya Anda dan pihak berwenang yang dapat mengakses laporan.'
                  }}
                </div>
              </section>
              <section class="panel how-panel">
                <span class="eyebrow">MUDAH & TERARAH</span>
                <h3>Bagaimana alurnya?</h3>
                <div
                  v-for="(item, i) in [
                    ['Sampaikan laporan', 'Ceritakan kejadian dan sumber bukti.'],
                    ['Verifikasi & pemeriksaan', 'Petugas menelaah dan menindaklanjuti.'],
                    ['Pantau perkembangannya', 'Lihat status dan jawab klarifikasi.'],
                  ]"
                  :key="i"
                  class="how-step"
                >
                  <span>{{ i + 1 }}</span>
                  <div>
                    <strong>{{ item[0] }}</strong>
                    <p>{{ item[1] }}</p>
                  </div>
                </div>
                <button class="text-button" @click="navigate('guide')">
                  Lihat panduan lengkap<ArrowUpRight :size="15" />
                </button>
              </section>
            </div>
            <div class="support-strip">
              <span class="support-icon"><HelpCircle :size="24" :stroke-width="1.5" /></span>
              <div>
                <strong>Masih ragu atau membutuhkan panduan?</strong>
                <p>Kenali jenis pelanggaran, cara melapor, dan perlindungan identitas Anda.</p>
              </div>
              <button class="button secondary" @click="navigate('help')">
                Pusat bantuan<ArrowUpRight :size="16" />
              </button>
            </div>
          </template>
          <template v-else-if="page === 'reports'"
            ><div class="page-heading">
              <div>
                <div class="eyebrow">{{ internal ? 'PENANGANAN PERKARA' : 'RUANG PELAPORAN' }}</div>
                <h1>{{ internal ? 'Antrean perkara' : 'Laporan saya' }}</h1>
                <p>
                  {{
                    internal
                      ? 'Perkara dalam lingkup penugasan dan kewenangan Anda.'
                      : 'Laporan dan draf privat yang dapat Anda akses.'
                  }}
                </p>
              </div>
              <button v-if="!internal" class="button" @click="newReport">
                <Plus :size="18" />Buat laporan
              </button>
            </div>
            <ReportList
              v-if="user"
              :key="user.id"
              :user="user"
              :categories="categories"
              @open="openReport"
            />
            <div v-else class="panel empty">
              <LockKeyhole />
              <h4>Masuk untuk melihat laporan</h4>
              <button class="button" @click="auth = 'login'">Masuk ke akun</button>
            </div></template
          >
          <template v-else-if="page === 'create' && user?.role === 'REPORTER'"
            ><div class="page-heading">
              <div>
                <button class="back-link" @click="openPublic()">
                  <ChevronLeft :size="16" />Kembali ke beranda
                </button>
                <h1>Sampaikan laporan Anda.</h1>
                <p>Isi dengan jelas dan sesuai fakta yang Anda ketahui.</p>
              </div>
              <span class="badge draft"><LockKeyhole :size="13" />Tanpa login</span>
            </div>
            <div class="form-layout">
              <article class="panel wbs-explanation" aria-labelledby="wbs-explanation-title">
                <div class="wbs-column-heading">
                  <h2 id="wbs-explanation-title">Whistleblowing System</h2>
                  <a href="/" @click.prevent="openPublic()">Beranda <ArrowUpRight :size="15" /></a>
                </div>
                <div class="wbs-explanation-content">
                  <p>
                    <strong>Whistleblowing System (WBS)</strong> adalah sarana untuk menyampaikan
                    dugaan pelanggaran di lingkungan {{ site.institutionName }} secara aman dan
                    rahasia. Sampaikan kejadian berdasarkan fakta dan informasi yang Anda ketahui.
                  </p>
                  <p>
                    Mahasiswa, dosen, tenaga kependidikan, maupun masyarakat dapat menyampaikan
                    laporan tanpa membuat akun. Simpan nomor tiket rahasia setelah laporan dikirim
                    untuk memantau penanganannya.
                  </p>
                  <h3>Tujuan WBS</h3>
                  <ol>
                    <li>
                      <strong>Menjaga integritas</strong>
                      <p>
                        Mendukung lingkungan kampus yang jujur, transparan, dan bertanggung jawab.
                      </p>
                    </li>
                    <li>
                      <strong>Mencegah dan menangani pelanggaran</strong>
                      <p>
                        Memberikan jalur pelaporan agar dugaan pelanggaran dapat diverifikasi dan
                        ditindaklanjuti oleh petugas yang berwenang.
                      </p>
                    </li>
                    <li>
                      <strong>Melindungi kerahasiaan pelapor</strong>
                      <p>
                        Identitas, isi laporan, dan bukti dibatasi bagi pihak yang berwenang
                        menangani aduan.
                      </p>
                    </li>
                  </ol>
                  <h3>Istilah dalam formulir</h3>
                  <dl>
                    <dt>Bidang</dt>
                    <dd>Kelompok bidang yang berkaitan dengan dugaan pelanggaran.</dd>
                    <dt>Sub kategori pelanggaran</dt>
                    <dd>Jenis dugaan pelanggaran yang lebih spesifik dalam bidang yang dipilih.</dd>
                    <dt>Kronologi</dt>
                    <dd>
                      Urutan kejadian: apa yang terjadi, siapa yang terlibat, kapan, di mana,
                      mengapa, dan bagaimana kejadiannya.
                    </dd>
                    <dt>Bukti pendukung</dt>
                    <dd>
                      Dokumen, foto, rekaman, atau sumber informasi yang membantu pemeriksaan
                      laporan.
                    </dd>
                    <dt>Nomor tiket</dt>
                    <dd>
                      Kunci rahasia untuk membuka rincian dan timeline laporan tanpa login. Simpan
                      dan jangan bagikan kepada pihak lain.
                    </dd>
                  </dl>
                  <div class="wbs-monitoring-note">
                    <LockKeyhole :size="21" />
                    <div>
                      <strong>Pantau perkembangan aduan Anda</strong>
                      <p>
                        Gunakan nomor tiket untuk melihat status, timeline penanganan, klarifikasi,
                        dan jawaban resmi.
                      </p>
                      <a href="/tracking" @click.prevent="openPublic('tracking')"
                        >Buka monitoring aduan <ArrowRight :size="15"
                      /></a>
                    </div>
                  </div>
                </div>
              </article>
              <section class="panel form-panel">
                <div class="wbs-column-heading"><h2>Form Whistleblowing System</h2></div>
                <div class="form-content">
                  <p class="wbs-form-notice">
                    <strong>Kerahasiaan laporan Anda dilindungi.</strong> Lengkapi informasi sesuai
                    fakta. Setelah dikirim, simpan nomor tiket untuk
                    <a href="/tracking" @click.prevent="openPublic('tracking')"
                      >memantau perkembangan aduan</a
                    >.
                  </p>
                  <span class="eyebrow">FORMULIR PENGADUAN</span>
                  <h2>Informasi kejadian</h2>
                  <p class="form-intro">
                    Lengkapi formulir di bawah ini. Kolom bertanda * wajib diisi.
                  </p>
                  <div class="fields">
                    <label
                      >Judul laporan <span>*</span
                      ><input
                        v-model="form.title"
                        maxlength="200"
                        placeholder="Ringkasan singkat dugaan pelanggaran" /></label
                    ><label
                      >Bidang <span>*</span
                      ><select v-model="form.category">
                        <option disabled value="">Pilih bidang</option>
                        <option v-for="c in categories">{{ c }}</option>
                      </select></label
                    >
                    <label
                      >Sub kategori pelanggaran <span>*</span>
                      <input
                        v-model="form.subcategory"
                        maxlength="200"
                        placeholder="Jenis dugaan pelanggaran dalam bidang yang dipilih"
                      />
                    </label>
                    <div class="two-fields">
                      <label
                        >Tanggal kejadian <span>*</span
                        ><input v-model="form.when" type="date" /></label
                      ><label
                        >Lokasi kejadian <span>*</span
                        ><input v-model="form.where" placeholder="Unit, gedung, atau lokasi"
                      /></label>
                    </div>
                  </div>
                  <h2 class="reporter-section-title">Kronologi &amp; pihak terkait</h2>
                  <div class="fields">
                    <label
                      >Apa yang terjadi? <span>*</span
                      ><textarea
                        v-model="form.what"
                        rows="5"
                        placeholder="Jelaskan bentuk pelanggaran yang Anda ketahui…"
                      ></textarea></label
                    ><label
                      >Siapa yang terlibat? <span>*</span
                      ><textarea
                        v-model="form.who"
                        rows="3"
                        placeholder="Pihak terkait dan perannya dalam kejadian"
                      ></textarea></label
                    ><label
                      >Mengapa kejadian ini diduga melanggar? <span>*</span
                      ><textarea
                        v-model="form.why"
                        rows="3"
                        placeholder="Jelaskan dasar laporan Anda"
                      ></textarea></label
                    ><label
                      >Bagaimana kejadiannya? <span>*</span
                      ><textarea
                        v-model="form.how"
                        rows="4"
                        placeholder="Urutan kejadian dan cara pelanggaran dilakukan"
                      ></textarea>
                    </label>
                  </div>
                  <h2 class="reporter-section-title">Bukti &amp; kerahasiaan</h2>
                  <div class="fields">
                    <div class="info-box">
                      <ShieldCheck :size="21" />
                      <div>
                        <strong>Bukti Anda disimpan secara privat</strong>
                        <p>
                          Unggah bukti pendukung atau jelaskan sumber bukti yang tersedia. Berkas
                          hanya dapat dibuka setelah lolos pemindaian keamanan.
                        </p>
                      </div>
                    </div>
                    <EvidencePanel v-if="selected" :report-id="selected.id" />
                    <div v-else class="info-box">
                      <p>
                        Simpan draf terlebih dahulu untuk mengunggah bukti, atau lanjutkan dengan
                        menjelaskan sumber bukti.
                      </p>
                      <button type="button" class="button secondary" :disabled="busy" @click="save">
                        Simpan draf
                      </button>
                    </div>
                    <label
                      >Sumber bukti atau alasan belum menyertakan bukti <span>*</span
                      ><textarea
                        v-model="form.evidenceReason"
                        rows="4"
                        placeholder="Jelaskan bukti yang tersedia, sumbernya, atau alasan belum dapat menyertakannya."
                      ></textarea>
                    </label>
                    <fieldset>
                      <legend>Kerahasiaan laporan</legend>
                      <label class="radio-card"
                        ><input
                          v-model="form.confidentiality"
                          type="radio"
                          value="PROTECTED" /><span
                          ><strong>Identitas terlindungi</strong
                          ><small>Identitas tidak ditampilkan dalam ringkasan perkara.</small></span
                        ><LockKeyhole :size="19" /></label
                      ><label class="radio-card"
                        ><input
                          v-model="form.confidentiality"
                          type="radio"
                          value="IDENTIFIED" /><span
                          ><strong>Bersedia dihubungi</strong
                          ><small>Kontak tetap terbatas untuk petugas yang berwenang.</small></span
                        ><UserRound :size="19"
                      /></label>
                    </fieldset>
                  </div>
                  <h2 class="reporter-section-title">Konfirmasi laporan</h2>
                  <div class="reporter-confirmation">
                    <label class="confirmation"
                      ><input v-model="confirmed" type="checkbox" /><span
                        >Saya menyatakan informasi yang disampaikan sesuai pengetahuan saya dan
                        dibuat dengan itikad baik.</span
                      ></label
                    >
                    <p v-if="!user?.verified" class="warning-text">
                      Verifikasi email diperlukan sebelum mengirim. Anda tetap dapat menyimpan draf.
                    </p>
                    <RecaptchaWidget ref="submissionCaptcha" v-model="submissionToken" />
                  </div>
                </div>
                <div class="form-actions">
                  <button type="button" class="button secondary" :disabled="busy" @click="save">
                    <Save :size="16" />Simpan draf
                  </button>
                  <button
                    type="button"
                    class="button"
                    :disabled="busy || !confirmed || !user?.verified || !submissionToken"
                    @click="submit"
                  >
                    <Send :size="16" />{{ busy ? 'Mengirim?' : 'Kirim laporan' }}
                  </button>
                </div>
              </section>
            </div>
          </template>
          <template v-else-if="page === 'detail' && selected"
            ><div class="page-heading">
              <div>
                <button class="back-link" @click="navigate('reports')">
                  <ChevronLeft :size="16" />Kembali ke laporan
                </button>
                <div class="eyebrow">{{ selected.number }}</div>
                <h1>{{ selected.payload.title }}</h1>
                <p>Dikirim {{ date(selected.createdAt) }} · Versi {{ selected.version }}</p>
              </div>
              <span class="badge" :class="selected.stage.toLowerCase()">{{
                stageLabels[selected.stage]
              }}</span>
            </div>
            <div class="detail-toolbar">
              <button
                type="button"
                class="button secondary"
                :aria-expanded="showTimeline"
                aria-controls="report-timeline"
                @click="showTimeline = !showTimeline"
              >
                <Clock :size="17" />{{
                  showTimeline ? 'Sembunyikan timeline' : 'Tampilkan timeline'
                }}
              </button>
            </div>
            <div class="detail-layout" :class="{ 'timeline-hidden': !showTimeline }">
              <section class="panel detail-body">
                <ReportTrackingCode
                  v-if="user?.role === 'REPORTER' && selected.trackingCode"
                  :code="selected.trackingCode"
                />
                <h3>Informasi laporan</h3>
                <div class="preview">
                  <div
                    v-for="(label, key) in {
                      category: 'Bidang',
                      subcategory: 'Sub kategori pelanggaran',
                      when: 'Tanggal kejadian',
                      where: 'Lokasi',
                      what: 'Kejadian',
                      who: 'Pihak terkait',
                      why: 'Dasar laporan',
                      how: 'Kronologi',
                      evidenceReason: 'Sumber bukti',
                    }"
                  >
                    <small>{{ label }}</small>
                    <p>{{ selected.payload[key] }}</p>
                  </div>
                </div>
                <div v-if="selected.clarification" class="clarification">
                  <h3><MessageSquare :size="20" />Permintaan klarifikasi</h3>
                  <p>{{ selected.clarification.question }}</p>
                  <template v-if="selected.clarification.response"
                    ><small>Tanggapan pelapor</small>
                    <p>{{ selected.clarification.response }}</p></template
                  ><template v-else-if="!internal"
                    ><label class="fields"
                      >Tanggapan Anda<textarea
                        v-model="response"
                        rows="4"
                        placeholder="Tuliskan jawaban dan informasi tambahan…"
                      ></textarea></label
                    ><button
                      class="button"
                      :disabled="busy || !response.trim()"
                      @click="command('RESPOND')"
                    >
                      Kirim tanggapan<Send :size="16" /></button
                  ></template>
                </div>
                <EvidencePanel
                  :report-id="selected.id"
                  @updated="workspace?.refresh()"
                  :readonly="
                    ['COMPLETED', 'CLOSED'].includes(selected.stage) ||
                    selected.lifecycle === 'SUSPENDED'
                  "
                />
              </section>
              <aside class="detail-sidebar">
                <section class="panel detail-actions" aria-label="Aksi laporan">
                  <div v-if="internal" class="internal-actions">
                    <h3>Tindakan petugas</h3>
                    <p>Akses dan tahap diperiksa ulang oleh server.</p>
                    <label class="fields"
                      >Catatan tindakan<textarea v-model="commandReason" rows="3"></textarea>
                    </label>
                    <div class="hero-actions">
                      <button
                        v-if="user?.role === 'INVESTIGATOR'"
                        class="button secondary"
                        :disabled="busy || !commandReason.trim()"
                        @click="command('CLARIFY')"
                      >
                        <MessageSquare :size="17" aria-hidden="true" />Minta klarifikasi</button
                      ><button
                        v-if="selected.stage === 'SUBMITTED' && user?.role === 'INVESTIGATOR'"
                        class="button"
                        :disabled="busy || !commandReason.trim()"
                        @click="command('ADVANCE')"
                      >
                        Mulai verifikasi<ArrowRight :size="16" />
                      </button>
                    </div>
                  </div>
                  <CaseWorkspace
                    ref="workspace"
                    v-if="user"
                    :report="selected"
                    :user="user"
                    @updated="refreshSelected"
                  />
                </section>
                <ReportTimeline id="report-timeline" v-show="showTimeline" :report="selected" />
              </aside></div
          ></template>
          <InternalDashboard
            v-else-if="internal && user"
            :user="user"
            :reports="reports"
            :loading="loading"
            @open="openReport"
            @queue="navigate('reports')"
          />
          <template v-else
            ><div class="page-heading">
              <div>
                <div class="eyebrow">INFORMASI & DUKUNGAN</div>
                <h1>
                  {{
                    page === 'guide'
                      ? 'Panduan pelaporan'
                      : page === 'privacy'
                        ? 'Kerahasiaan Anda.'
                        : 'Kami membantu Anda melapor.'
                  }}
                </h1>
                <p>Kenali prosesnya agar Anda dapat melapor dengan lebih yakin.</p>
              </div>
            </div>
            <div class="info-layout">
              <section class="panel article">
                <template v-if="page === 'guide'"
                  ><h2>Setiap laporan dimulai dari fakta.</h2>
                  <p>
                    WBS Universitas Jember menerima dugaan pelanggaran yang berkaitan dengan
                    lingkungan universitas. Sistem ini menggunakan akun terverifikasi.
                  </p>
                  <div
                    v-for="(s, i) in [
                      [
                        'Buat dan verifikasi akun',
                        'Daftarkan email Anda dan buka tautan verifikasi.',
                      ],
                      [
                        'Lengkapi informasi 5W+1H',
                        'Jelaskan apa, siapa, kapan, di mana, mengapa, dan bagaimana.',
                      ],
                      [
                        'Sertakan sumber bukti',
                        'Jika belum memiliki lampiran, jelaskan sumber informasi atau alasannya.',
                      ],
                      [
                        'Periksa dan kirim',
                        'Draf tetap privat sampai Anda mengonfirmasi pengiriman.',
                      ],
                      [
                        'Pantau dan tanggapi',
                        'Lihat nomor penerimaan, perkembangan, dan jawab klarifikasi melalui portal.',
                      ],
                    ]"
                    class="guide-step"
                  >
                    <span>{{ i + 1 }}</span>
                    <div>
                      <h3>{{ s[0] }}</h3>
                      <p>{{ s[1] }}</p>
                    </div>
                  </div>
                  <button class="button" @click="newReport">
                    Mulai buat laporan<ArrowRight :size="17" /></button></template
                ><template v-else-if="page === 'privacy'"
                  ><ShieldCheck :size="36" class="green-text" />
                  <h2>Identitas dibatasi sesuai kewenangan.</h2>
                  <p>
                    Pelaporan menggunakan akun terverifikasi. Draf hanya dapat diakses pemilik.
                    Setelah dikirim, perkara hanya tersedia bagi petugas dengan akses perkara aktif.
                  </p>
                  <h3>Jaga informasi sensitif</h3>
                  <p>
                    Hindari menyebarkan nomor laporan, kronologi, dan bukti melalui kanal publik.
                    Akses khusus identitas dan pengelolaan bukti masih memerlukan penyelesaian
                    kendali keamanan sebelum penggunaan operasional.
                  </p>
                  <h3>Riwayat tetap tercatat</h3>
                  <p>
                    Pengiriman dan tanggapan menyimpan versi dan jejak audit. Laporan tidak dihapus
                    melalui permintaan penarikan biasa.
                  </p>
                  <div class="info-box">
                    <LockKeyhole :size="22" />
                    <p>
                      Versi pengembangan ini digunakan dengan data sintetis. Kebijakan resmi dan
                      kesiapan operasional belum ditetapkan.
                    </p>
                  </div></template
                ><template v-else
                  ><h2>Pertanyaan yang sering diajukan</h2>
                  <details
                    v-for="item in [
                      [
                        'Apakah saya dapat melapor tanpa akun?',
                        'Tidak. Anda memerlukan akun dan email terverifikasi untuk mengirim laporan.',
                      ],
                      [
                        'Apakah draf dapat dibaca petugas?',
                        'Tidak. Draf bersifat privat dan hanya dapat diakses oleh pemilik.',
                      ],
                      [
                        'Bagaimana jika belum memiliki bukti?',
                        'Jelaskan sumber informasi atau alasan belum menyertakan bukti pada formulir laporan.',
                      ],
                      [
                        'Apakah laporan otomatis ditutup jika saya terlambat menjawab?',
                        'Tidak. Petugas perlu menelaah informasi yang tersedia sesuai prosedur.',
                      ],
                      [
                        'Bagaimana cara melihat perkembangan laporan?',
                        'Masuk ke akun, pilih Laporan saya, lalu buka laporan yang ingin dipantau.',
                      ],
                    ]"
                    :key="item[0]"
                  >
                    <summary>{{ item[0] }}</summary>
                    <p>{{ item[1] }}</p>
                  </details>
                  <div class="info-box">
                    <HelpCircle :size="22" />
                    <p>
                      Kontak resmi verifikator/pemeriksa akan ditampilkan setelah ditetapkan oleh
                      Universitas Jember.
                    </p>
                  </div></template
                >
              </section>
              <aside class="form-aside">
                <BookOpen :size="28" />
                <h3>Sampaikan dengan itikad baik.</h3>
                <p>Laporan yang jelas membantu petugas menelaah informasi dengan cermat.</p>
                <button
                  class="text-button"
                  @click="navigate(page === 'privacy' ? 'guide' : 'privacy')"
                >
                  {{ page === 'privacy' ? 'Panduan pelaporan' : 'Tentang kerahasiaan'
                  }}<ArrowRight :size="16" />
                </button>
              </aside></div
          ></template>
          <footer class="footer">
            <span>© {{ new Date().getFullYear() }} Universitas Jember</span
            ><span
              >Whistleblowing System <i></i
              ><button v-if="!internal" @click="navigate('privacy')">
                Kerahasiaan & perlindungan</button
              ><span v-else>Akses internal terbatas</span></span
            >
          </footer>
        </main>
      </div>
    </template>
    <AccountRecovery
      v-if="['recovery', 'reset'].includes(auth)"
      :token="auth === 'reset' ? resetToken : undefined"
      :initial-kind="recoveryKind"
      @close="auth = publicAuthPage ? 'login' : ''"
      @done="
        (m: string) => {
          notice = m;
          if (!user) openAuth('login', true);
          else auth = '';
          resetToken = '';
        }
      "
    />
  </div>
</template>
