<script setup lang="ts">
import {
  ShieldCheck,
  LayoutDashboard,
  Files,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
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
import { stageLabels, type Report, type ReportPayload, type User } from '@wbs/contracts';
const user = ref<User | null>(null),
  page = ref('dashboard'),
  auth = ref(''),
  busy = ref(false),
  loading = ref(false),
  error = ref(''),
  notice = ref(''),
  mobile = ref(false),
  query = ref(''),
  filter = ref('Semua'),
  step = ref(0),
  reports = ref<Report[]>([]),
  selected = ref<Report | null>(null),
  showNotifications = ref(false);
const {
  notifications,
  unreadCount,
  connectionStatus,
  announcement,
  refresh: refreshNotifications,
} = useRealtimeNotifications(user, showNotifications);
const credentials = reactive({ name: '', email: '', password: '' });
const resetToken = ref('');
const workspace = ref<{ refresh: () => Promise<void> } | null>(null);
watch(auth, async (value) => {
  if (value) {
    await nextTick();
    document.querySelector<HTMLInputElement>('[role="dialog"] input')?.focus();
  }
});
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    auth.value = '';
    mobile.value = false;
    showNotifications.value = false;
  }
  if (event.key === 'Tab' && auth.value) {
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
onUnmounted(() => window.removeEventListener('keydown', keydown));
const empty = (): ReportPayload => ({
  title: '',
  category: '',
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
const eventLabels: Record<string, string> = {
  SUBMIT: 'Laporan diterima',
  CLARIFY: 'Klarifikasi diminta',
  RESPOND: 'Tanggapan diterima',
  ADVANCE: 'Tahap diperbarui',
  STATUS_UPDATED: 'Perkembangan terbaru',
};
const categories = [
  'Penyalahgunaan wewenang',
  'Korupsi & gratifikasi',
  'Pelanggaran akademik',
  'Pelanggaran etika',
  'Pengadaan barang & jasa',
  'Pelanggaran lainnya',
];
const steps = [
  'Informasi kejadian',
  'Kronologi & pihak terkait',
  'Bukti & kerahasiaan',
  'Pratinjau',
];
const active = computed(() =>
  reports.value.filter((r) => !['DRAFT', 'COMPLETED', 'CLOSED'].includes(r.stage)),
);
const needsReply = computed(() =>
  reports.value.filter((r) => r.clarification && !r.clarification.response),
);
const shown = computed(() =>
  reports.value.filter(
    (r) =>
      (filter.value === 'Semua' ||
        (filter.value === 'Aktif' && !['DRAFT', 'COMPLETED', 'CLOSED'].includes(r.stage)) ||
        (filter.value === 'Draf' && r.stage === 'DRAFT') ||
        (filter.value === 'Selesai' && ['COMPLETED', 'CLOSED'].includes(r.stage))) &&
      `${r.payload.title} ${r.number || ''}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
);
const internal = computed(() => user.value && user.value.role !== 'REPORTER');
const date = (s: string) =>
  new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(s));
const initials = computed(() =>
  (user.value?.name || 'Tamu')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join(''),
);
async function api<T = any>(path: string, options: any = {}): Promise<T> {
  return (await $fetch<T>(`/api/v1${path}`, {
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
function navigate(p: string) {
  page.value = p;
  mobile.value = false;
  error.value = '';
  notice.value = '';
}
function newReport() {
  if (!user.value) {
    auth.value = 'login';
    return;
  }
  selected.value = null;
  Object.assign(form, empty());
  step.value = 0;
  confirmed.value = false;
  navigate('create');
}
async function login() {
  await run(async () => {
    user.value = await api<User>('/auth/login', { method: 'POST', body: credentials });
    credentials.password = '';
    auth.value = '';
    await load();
  });
}
async function register() {
  await run(async () => {
    const result = await api('/auth/register', { method: 'POST', body: credentials });
    notice.value = result.message;
    auth.value = 'login';
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
    navigate('dashboard');
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
function next() {
  error.value = '';
  const fields =
    step.value === 0
      ? ['title', 'category', 'when', 'where']
      : step.value === 1
        ? ['what', 'who', 'why', 'how']
        : ['evidenceReason'];
  if (fields.some((k) => !String(form[k as keyof ReportPayload]).trim())) {
    error.value = 'Lengkapi semua kolom sebelum melanjutkan.';
    return;
  }
  step.value++;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function submit() {
  await run(async () => {
    if (!confirmed.value)
      throw { data: { message: 'Konfirmasi kebenaran laporan terlebih dahulu.' } };
    await saveDraft();
    await api(`/reports/${selected.value!.id}/commands`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `submit-${selected.value!.id}-${selected.value!.version}` },
      body: {
        action: 'SUBMIT',
        expectedVersion: selected.value!.version,
        reason: 'Laporan dikirim oleh pelapor.',
      },
    });
    selected.value = await api<Report>(`/reports/${selected.value!.id}`);
    navigate('detail');
    await load();
    notice.value = 'Laporan berhasil dikirim. Simpan nomor penerimaan Anda.';
  });
}
async function openReport(r: Report) {
  await run(async () => {
    selected.value = await api<Report>(`/reports/${r.id}`);
    if (selected.value.stage === 'DRAFT') {
      Object.assign(form, selected.value.payload);
      step.value = 0;
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
onMounted(async () => {
  window.addEventListener('keydown', keydown);
  const reset = new URLSearchParams(window.location.search).get('reset');
  if (reset) {
    resetToken.value = reset;
    auth.value = 'reset';
    history.replaceState({}, '', window.location.pathname);
  }
  const verify = new URLSearchParams(window.location.search).get('verify');
  if (verify) {
    await run(async () => {
      const r = await api('/auth/verify', { method: 'POST', body: { token: verify } });
      notice.value = r.message;
      auth.value = 'login';
      history.replaceState({}, '', window.location.pathname);
    });
  }
  try {
    user.value = await api<User>('/me');
    await load();
  } catch (e: any) {
    if (e?.statusCode !== 401) error.value = message(e);
  }
});
</script>

<template>
  <div class="shell">
    <div v-if="mobile" class="backdrop" @click="mobile = false"></div>
    <aside class="sidebar" :class="{ open: mobile }">
      <a href="#" class="brand" @click.prevent="navigate('dashboard')"
        ><span class="brand-icon"><ShieldCheck :size="28" /></span
        ><span>WBS<span class="brand-sub">UNIVERSITAS JEMBER</span></span></a
      >
      <button class="sidebar-close icon-button" aria-label="Tutup navigasi" @click="mobile = false">
        <X />
      </button>
      <div class="workspace-label">PORTAL {{ internal ? 'INTERNAL' : 'PELAPOR' }}</div>
      <nav aria-label="Menu utama">
        <button :class="{ active: page === 'dashboard' }" @click="navigate('dashboard')">
          <LayoutDashboard :size="19" />Ringkasan
        </button>
        <button
          :class="{ active: ['reports', 'detail', 'create'].includes(page) }"
          @click="navigate('reports')"
        >
          <Files :size="19" />{{ internal ? 'Antrean perkara' : 'Laporan saya'
          }}<span v-if="user" class="count">{{ reports.length }}</span>
        </button>
        <button :class="{ active: page === 'guide' }" @click="navigate('guide')">
          <BookOpen :size="19" />Panduan pelaporan<ArrowUpRight class="nav-arrow" :size="15" />
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="private-note">
          <div class="private-note-icon"><LockKeyhole :size="19" /></div>
          <strong>Ruang aman untuk bersuara.</strong>
          <p>Identitas dan laporan Anda dibatasi untuk pihak yang berwenang.</p>
          <button @click="navigate('privacy')">
            Tentang kerahasiaan <ArrowRight :size="14" />
          </button>
        </div>
        <button class="help-link" @click="navigate('help')">
          <HelpCircle :size="18" />Pusat bantuan<ArrowUpRight :size="15" />
        </button>
        <div class="institution">
          <span class="uni-mark">U</span
          ><span>Universitas Jember<small>Integritas untuk masa depan.</small></span>
        </div>
      </div>
    </aside>
    <div class="main-wrapper">
      <header class="topbar">
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
              ? 'Ringkasan'
              : page === 'create'
                ? 'Buat laporan'
                : page === 'detail'
                  ? 'Detail laporan'
                  : page === 'reports'
                    ? 'Laporan saya'
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
        <div v-if="showNotifications" class="notification-panel">
          <strong>Notifikasi</strong>
          <small class="notification-connection">{{
            connectionStatus === 'connected'
              ? 'Pembaruan langsung aktif'
              : connectionStatus === 'connecting'
                ? 'Menghubungkan pembaruan langsung…'
                : 'Koneksi langsung terputus. Daftar tetap dapat dibuka.'
          }}</small>
          <p v-if="!notifications.length">Belum ada pemberitahuan baru.</p>
          <p v-for="n in notifications" :key="n.id">
            {{ n.message }}<small>{{ date(n.created_at) }}</small>
          </p>
          <button
            v-if="user"
            class="text-button"
            @click="
              showNotifications = false;
              navigate('reports');
            "
          >
            Lihat laporan<ArrowRight :size="14" />
          </button>
        </div>
        <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
      </header>
      <main id="main-content">
        <div v-if="error" class="alert error" role="alert">
          <AlertCircle :size="19" /><span>{{ error }}</span
          ><button class="icon-button" aria-label="Tutup pesan" @click="error = ''">
            <X :size="16" />
          </button>
        </div>
        <div v-if="notice" class="alert success" role="status">
          <CheckCircle2 :size="19" /><span>{{ notice }}</span>
        </div>
        <template v-if="page === 'dashboard'">
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
                Laporkan dugaan pelanggaran dengan aman dan bertanggung jawab. Setiap laporan adalah
                langkah menuju perubahan.
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
              <div class="eyebrow">RUANG PELAPORAN</div>
              <h1>{{ internal ? 'Antrean perkara' : 'Laporan saya' }}</h1>
              <p>Laporan dan draf privat yang dapat Anda akses.</p>
            </div>
            <button class="button" @click="newReport"><Plus :size="18" />Buat laporan</button>
          </div>
          <div class="panel">
            <div class="list-toolbar">
              <div class="tabs">
                <button
                  v-for="f in ['Semua', 'Aktif', 'Draf', 'Selesai']"
                  :class="{ selected: filter === f }"
                  @click="filter = f"
                >
                  {{ f }}
                </button>
              </div>
              <label class="search"
                ><Search :size="17" /><input
                  v-model="query"
                  placeholder="Cari judul atau nomor…"
                  aria-label="Cari laporan"
              /></label>
            </div>
            <div v-if="!user" class="empty">
              <LockKeyhole />
              <h4>Masuk untuk melihat laporan</h4>
              <button class="button" @click="auth = 'login'">Masuk ke akun</button>
            </div>
            <div v-else-if="!shown.length" class="empty">
              <Files />
              <h4>{{ query ? 'Laporan tidak ditemukan' : 'Belum ada laporan' }}</h4>
              <p>Coba filter lain atau buat laporan baru.</p>
            </div>
            <button v-for="r in shown" :key="r.id" class="report-row" @click="openReport(r)">
              <span class="report-icon"><FileText :size="20" /></span
              ><span class="report-copy"
                ><strong>{{ r.payload.title || 'Draf tanpa judul' }}</strong
                ><small
                  >{{ r.number || 'Draf privat' }}<span>·</span>{{ date(r.updatedAt) }}</small
                ></span
              ><span class="badge" :class="r.stage.toLowerCase()">{{ stageLabels[r.stage] }}</span
              ><ChevronRight :size="17" />
            </button>
            <div v-if="reports.length === 50" class="panel-footer">
              Menampilkan 50 laporan terbaru. Gunakan pencarian untuk mempersempit hasil.
            </div>
          </div></template
        >
        <template v-else-if="page === 'create'"
          ><div class="page-heading">
            <div>
              <button class="back-link" @click="navigate('reports')">
                <ChevronLeft :size="16" />Kembali ke laporan
              </button>
              <h1>Sampaikan laporan Anda.</h1>
              <p>Isi dengan jelas dan sesuai fakta yang Anda ketahui.</p>
            </div>
            <span class="badge draft"><LockKeyhole :size="13" />Draf privat</span>
          </div>
          <div class="form-layout">
            <section class="panel form-panel">
              <div class="steps">
                <div v-for="(s, i) in steps" :class="{ current: step === i, done: step > i }">
                  <span
                    ><Check v-if="step > i" :size="15" /><template v-else>{{
                      i + 1
                    }}</template></span
                  ><small>{{ s }}</small>
                </div>
              </div>
              <div class="form-content">
                <span class="eyebrow">LANGKAH {{ step + 1 }} DARI 4</span>
                <h2>{{ steps[step] }}</h2>
                <p class="form-intro">
                  {{
                    [
                      'Mulai dengan gambaran umum kejadian yang ingin dilaporkan.',
                      'Ceritakan apa yang terjadi. Hindari dugaan yang tidak berdasar.',
                      'Jelaskan sumber bukti dan pilih kerahasiaan laporan.',
                      'Periksa kembali seluruh informasi sebelum mengirim.',
                    ][step]
                  }}
                </p>
                <div v-if="step === 0" class="fields">
                  <label
                    >Judul laporan <span>*</span
                    ><input
                      v-model="form.title"
                      maxlength="200"
                      placeholder="Ringkasan singkat dugaan pelanggaran" /></label
                  ><label
                    >Kategori pelanggaran <span>*</span
                    ><select v-model="form.category">
                      <option disabled value="">Pilih kategori</option>
                      <option v-for="c in categories">{{ c }}</option>
                    </select></label
                  >
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
                <div v-if="step === 1" class="fields">
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
                <div v-if="step === 2" class="fields">
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
                      ><input v-model="form.confidentiality" type="radio" value="PROTECTED" /><span
                        ><strong>Identitas terlindungi</strong
                        ><small>Identitas tidak ditampilkan dalam ringkasan perkara.</small></span
                      ><LockKeyhole :size="19" /></label
                    ><label class="radio-card"
                      ><input v-model="form.confidentiality" type="radio" value="IDENTIFIED" /><span
                        ><strong>Bersedia dihubungi</strong
                        ><small>Kontak tetap terbatas; bukan laporan tanpa akun.</small></span
                      ><UserRound :size="19"
                    /></label>
                  </fieldset>
                </div>
                <div v-if="step === 3" class="preview">
                  <div
                    v-for="(label, key) in {
                      title: 'Judul',
                      category: 'Kategori',
                      when: 'Tanggal',
                      where: 'Lokasi',
                      what: 'Kejadian',
                      who: 'Pihak terkait',
                      why: 'Dasar laporan',
                      how: 'Kronologi',
                      evidenceReason: 'Sumber bukti',
                    }"
                    :key="key"
                  >
                    <small>{{ label }}</small>
                    <p>{{ form[key] }}</p>
                  </div>
                  <div>
                    <small>Kerahasiaan</small>
                    <p>
                      {{
                        form.confidentiality === 'PROTECTED'
                          ? 'Identitas terlindungi'
                          : 'Bersedia dihubungi'
                      }}
                    </p>
                  </div>
                  <label class="confirmation"
                    ><input v-model="confirmed" type="checkbox" /><span
                      >Saya menyatakan informasi yang disampaikan sesuai pengetahuan saya dan dibuat
                      dengan itikad baik.</span
                    ></label
                  >
                  <p v-if="!user?.verified" class="warning-text">
                    Verifikasi email diperlukan sebelum mengirim. Anda tetap dapat menyimpan draf.
                  </p>
                </div>
              </div>
              <div class="form-actions">
                <button class="button secondary" :disabled="busy" @click="save">
                  <Save :size="16" />Simpan draf
                </button>
                <div>
                  <button v-if="step > 0" class="text-button" @click="step--">
                    <ChevronLeft :size="16" />Kembali</button
                  ><button v-if="step < 3" class="button" @click="next">
                    Lanjutkan<ArrowRight :size="16" /></button
                  ><button
                    v-else
                    class="button"
                    :disabled="busy || !confirmed || !user?.verified"
                    @click="submit"
                  >
                    <Send :size="16" />{{ busy ? 'Mengirim…' : 'Kirim laporan' }}
                  </button>
                </div>
              </div>
            </section>
            <aside class="form-aside">
              <span class="aside-shield"><ShieldCheck :size="28" /></span>
              <h3>Anda berada di ruang yang aman.</h3>
              <p>
                Draf hanya dapat dibaca oleh Anda. Laporan baru masuk ke proses verifikasi setelah
                dikirim.
              </p>
              <hr />
              <strong>Laporan yang baik memuat:</strong>
              <ul>
                <li>Fakta yang Anda ketahui</li>
                <li>Waktu dan lokasi yang jelas</li>
                <li>Pihak terkait dan kronologi</li>
                <li>Bukti atau sumber informasi</li>
              </ul>
              <button class="text-button" @click="navigate('guide')">
                Baca panduan<ArrowUpRight :size="15" />
              </button>
            </aside></div
        ></template>
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
          <div class="detail-layout">
            <section class="panel detail-body">
              <h3>Informasi laporan</h3>
              <div class="preview">
                <div
                  v-for="(label, key) in {
                    category: 'Kategori',
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
              <div v-if="internal" class="internal-actions">
                <h3>Tindakan petugas</h3>
                <p>Akses dan tahap diperiksa ulang oleh server.</p>
                <label class="fields"
                  >Catatan tindakan<textarea v-model="commandReason" rows="3"></textarea>
                </label>
                <div class="hero-actions">
                  <button
                    v-if="user?.role === 'MANAGER'"
                    class="button secondary"
                    :disabled="busy || !commandReason.trim()"
                    @click="command('CLARIFY')"
                  >
                    Minta klarifikasi</button
                  ><button
                    v-if="selected.stage === 'SUBMITTED' && user?.role === 'MANAGER'"
                    class="button"
                    :disabled="busy || !commandReason.trim()"
                    @click="command('ADVANCE')"
                  >
                    Mulai verifikasi<ArrowRight :size="16" />
                  </button>
                </div>
              </div>
              <EvidencePanel
                :report-id="selected.id"
                @updated="workspace?.refresh()"
                :readonly="
                  ['COMPLETED', 'CLOSED'].includes(selected.stage) ||
                  selected.lifecycle === 'SUSPENDED'
                "
              /><CaseWorkspace
                ref="workspace"
                v-if="user"
                :report="selected"
                :user="user"
                @updated="refreshSelected"
              />
            </section>
            <aside class="panel timeline">
              <h3>Perkembangan laporan</h3>
              <div v-for="(e, i) in selected.events" :key="i" class="timeline-item">
                <span><Check :size="13" /></span>
                <div>
                  <strong>{{ eventLabels[e.action] || e.action }}</strong
                  ><small>{{ date(e.createdAt) }}</small>
                  <p>{{ e.reason }}</p>
                </div>
              </div>
              <div class="timeline-note">
                <LockKeyhole :size="16" />
                <p>Timeline menampilkan informasi yang sesuai dengan hak akses Anda.</p>
              </div>
            </aside>
          </div></template
        >
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
                  Akses khusus identitas dan pengelolaan bukti masih memerlukan penyelesaian kendali
                  keamanan sebelum penggunaan operasional.
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
                    Kontak resmi pengelola akan ditampilkan setelah ditetapkan oleh Universitas
                    Jember.
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
            ><button @click="navigate('privacy')">Kerahasiaan & perlindungan</button></span
          >
        </footer>
      </main>
    </div>
    <AccountRecovery
      v-if="['recovery', 'reset'].includes(auth)"
      :token="auth === 'reset' ? resetToken : undefined"
      @close="auth = ''"
      @done="
        (m: string) => {
          notice = m;
          auth = 'login';
          resetToken = '';
        }
      "
    />
    <div v-else-if="auth" class="modal-backdrop" @click.self="auth = ''">
      <section role="dialog" aria-modal="true" aria-labelledby="auth-title" class="auth-modal">
        <button class="modal-close icon-button" aria-label="Tutup" @click="auth = ''"><X /></button
        ><span class="brand-icon"><ShieldCheck :size="28" /></span>
        <div class="eyebrow">WBS UNIVERSITAS JEMBER</div>
        <h2 id="auth-title">
          {{ auth === 'register' ? 'Mulai dari keberanian Anda.' : 'Selamat datang kembali.' }}
        </h2>
        <p>
          {{
            auth === 'register'
              ? 'Buat akun untuk menyampaikan laporan dengan aman.'
              : 'Masuk untuk melanjutkan dan memantau laporan Anda.'
          }}
        </p>
        <div v-if="error" class="alert error" role="alert">{{ error }}</div>
        <div v-if="notice" class="alert success" role="status">{{ notice }}</div>
        <form class="fields" @submit.prevent="auth === 'register' ? register() : login()">
          <label v-if="auth === 'register'"
            >Nama lengkap<input v-model="credentials.name" autocomplete="name" required /></label
          ><label
            >Email<input
              v-model="credentials.email"
              type="email"
              autocomplete="email"
              placeholder="nama@email.com"
              required /></label
          ><label
            >Kata sandi<input
              v-model="credentials.password"
              type="password"
              :autocomplete="auth === 'register' ? 'new-password' : 'current-password'"
              :minlength="auth === 'register' ? 12 : 1"
              maxlength="128"
              :placeholder="auth === 'register' ? 'Minimal 12 karakter' : 'Masukkan kata sandi'"
              required /></label
          ><button class="button full" :disabled="busy" type="submit">
            <LoaderCircle v-if="busy" class="spin" :size="18" />{{
              busy ? 'Memproses…' : auth === 'register' ? 'Buat akun' : 'Masuk ke akun'
            }}<ArrowRight :size="17" />
          </button>
        </form>
        <p class="auth-switch">
          <button
            v-if="auth === 'login'"
            @click="
              auth = 'recovery';
              error = '';
            "
          >
            Lupa kata sandi / verifikasi ulang
          </button>
        </p>
        <p class="auth-switch">
          {{ auth === 'register' ? 'Sudah punya akun?' : 'Belum punya akun?' }}
          <button
            @click="
              auth = auth === 'register' ? 'login' : 'register';
              error = '';
              notice = '';
            "
          >
            {{ auth === 'register' ? 'Masuk' : 'Daftar sekarang' }}
          </button>
        </p>
        <div class="auth-foot">
          <LockKeyhole :size="13" />Gunakan data sintetis pada versi pengembangan ini.
        </div>
      </section>
    </div>
  </div>
</template>
