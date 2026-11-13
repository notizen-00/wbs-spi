<script setup lang="ts">
import {
  ShieldCheck,
  ArrowUpRight,
  ArrowRight,
  LockKeyhole,
  HelpCircle,
  CheckCircle2,
  ChartNoAxesCombined,
  Files,
  Clock3,
  Archive,
  Menu,
  X,
} from '@lucide/vue';
const mobileNavOpen = ref(false);
const mobileNavToggle = ref<HTMLButtonElement | null>(null);
function closeMobileNav(event: KeyboardEvent) {
  if (event.key === 'Escape' && mobileNavOpen.value) {
    mobileNavOpen.value = false;
    mobileNavToggle.value?.focus();
  }
}
const props = defineProps<{
  authPage: boolean;
  trackingPage?: boolean;
  demoAvailable?: boolean;
  serviceError?: string;
}>();
const { site } = useSiteConfiguration();
const {
  data: statistics,
  status: statisticsStatus,
  error: statisticsError,
  refresh: refreshStatistics,
} = await useAsyncData(
  'public-report-statistics',
  () =>
    $fetch<{
      total: number;
      active: number;
      completed: number;
      closed: number;
      categories: { name: string; count: number }[];
      monthly: { month: string; count: number }[];
      updatedAt: string;
    }>('/api/v1/public/statistics', { timeout: 5000, retry: 0 }),
  { immediate: !props.authPage && !props.trackingPage },
);
watch(
  () => !props.authPage && !props.trackingPage,
  (landing) => {
    if (landing && !statistics.value) void refreshStatistics();
  },
);
const number = (value: number) => new Intl.NumberFormat('id-ID').format(value);
const statisticCards = computed(() => [
  { label: 'Laporan terkirim', value: statistics.value?.total ?? 0, icon: Files },
  { label: 'Dalam proses', value: statistics.value?.active ?? 0, icon: Clock3 },
  { label: 'Selesai', value: statistics.value?.completed ?? 0, icon: CheckCircle2 },
  { label: 'Ditutup', value: statistics.value?.closed ?? 0, icon: Archive },
]);
const chartCategories = computed(() => {
  const rows = statistics.value?.categories ?? [];
  if (rows.length <= 6) return rows;
  return [
    ...rows.slice(0, 5),
    { name: 'Bidang lainnya', count: rows.slice(5).reduce((sum, row) => sum + row.count, 0) },
  ];
});
const chartMax = computed(() => Math.max(1, ...chartCategories.value.map((row) => row.count)));
const percentage = (count: number) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(
    statistics.value?.total ? (count / statistics.value.total) * 100 : 0,
  );

defineEmits<{ login: []; report: []; home: []; section: [section: string] }>();
const steps = [
  [
    'Siapkan informasi',
    'Tuliskan kejadian secara jelas: apa, siapa, kapan, di mana, mengapa, dan bagaimana. Sertakan sumber bukti yang tersedia.',
  ],
  [
    'Lengkapi dan kirim laporan',
    'Klik Laporkan dan lengkapi formulir tanpa membuat akun atau login. Anda dapat menyimpannya sebagai draf sebelum mengirim.',
  ],
  [
    'Pantau penanganan',
    'Simpan nomor tiket rahasia dan pantau timeline melalui menu Cek status. Jawab klarifikasi jika diminta oleh verifikator/pemeriksa.',
  ],
  [
    'Terima jawaban resmi',
    'Setelah pemeriksaan dan tindak lanjut selesai, jawaban resmi yang telah disetujui tersedia di portal Anda.',
  ],
];
const faqs = [
  [
    'Apa yang dapat dilaporkan?',
    'Dugaan penyalahgunaan wewenang, korupsi atau gratifikasi, pelanggaran akademik dan etika, serta pelanggaran pengadaan di lingkungan Universitas Jember. Sampaikan fakta dengan itikad baik.',
  ],
  [
    'Apakah saya perlu membuat akun?',
    'Tidak. Klik Laporkan untuk menyampaikan aduan tanpa login. Simpan nomor tiket rahasia untuk memantau laporan Anda.',
  ],
  [
    'Bukti apa yang dapat disertakan?',
    'PDF, gambar, MP3, dan video sesuai format yang didukung. Maksimal 20 MiB per berkas dan 10 berkas per laporan. Bukti dikarantina sampai lolos pemindaian keamanan.',
  ],
  [
    'Bagaimana melihat perkembangan laporan?',
    'Buka Cek status dan masukkan nomor tiket untuk melihat rincian, timeline, klarifikasi, dan jawaban resmi tanpa login.',
  ],
  [
    'Bagaimana jika nomor tiket hilang?',
    'Simpan tiket di tempat aman setelah mengirim laporan. Tiket bersifat rahasia dan diperlukan untuk membuka monitoring tanpa login.',
  ],
];
</script>

<template>
  <div class="public-portal">
    <a href="#public-content" class="public-skip">Lewati ke konten</a>
    <header
      class="public-header"
      @keydown="closeMobileNav"
      @click="($event.target as HTMLElement).closest('a') && (mobileNavOpen = false)"
    >
      <a
        href="/"
        class="public-brand"
        :aria-label="`${site.appName} ${site.institutionName} — Beranda`"
        @click.prevent="$emit('home')"
        ><SiteBrand logo-only
      /></a>
      <button
        ref="mobileNavToggle"
        type="button"
        class="public-nav-toggle"
        :aria-label="mobileNavOpen ? 'Tutup navigasi' : 'Buka navigasi'"
        :aria-expanded="mobileNavOpen"
        aria-controls="public-navigation"
        @click="mobileNavOpen = !mobileNavOpen"
      >
        <X v-if="mobileNavOpen" :size="25" />
        <Menu v-else :size="25" />
      </button>
      <nav
        id="public-navigation"
        :class="{ 'is-open': mobileNavOpen }"
        aria-label="Navigasi publik"
      >
        <a href="/guide" @click.prevent="$emit('section', 'guide')">Alur pelaporan</a
        ><a href="/privacy" @click.prevent="$emit('section', 'privacy')">Kerahasiaan</a
        ><a href="/help" @click.prevent="$emit('section', 'help')">Pusat bantuan</a>
        <a href="/tracking" @click.prevent="$emit('section', 'tracking')">Cek status</a>
        <a v-if="demoAvailable" href="/demo" @click.prevent="$emit('section', 'demo')"
          >Alur aplikasi demo</a
        >
      </nav>
      <a href="/reports/new" class="button secondary public-login" @click.prevent="$emit('login')"
        >Laporkan<ArrowRight :size="16"
      /></a>
    </header>
    <main id="public-content" class="public-main">
      <div v-if="serviceError && !authPage" class="alert error" role="alert">
        {{ serviceError }}
      </div>
      <section
        v-if="trackingPage"
        class="public-tracking-page"
        aria-label="Halaman pelacakan laporan"
      >
        <a href="/" class="public-text-link" @click.prevent="$emit('home')"
          >Kembali ke beranda<ArrowRight :size="16"
        /></a>
        <PublicTracking />
      </section>
      <template v-else-if="!authPage">
        <section class="public-hero" aria-labelledby="public-title">
          <div class="public-hero-copy">
            <div class="public-kicker"><span>01 / KANAL PELAPORAN</span> WHISTLEBLOWING SYSTEM</div>
            <h1 id="public-title">Ada yang perlu<br /><em>dilaporkan?</em></h1>
            <p>
              Sampaikan dugaan pelanggaran di lingkungan {{ site.institutionName }}. Tuliskan
              kejadiannya, sertakan informasi yang Anda ketahui, lalu ikuti penanganannya melalui
              portal ini.
            </p>
            <div class="public-actions">
              <a href="/reports/new" class="button public-primary" @click.prevent="$emit('report')"
                >Buat laporan<ArrowUpRight :size="18" /></a
              ><a href="/guide" class="public-text-link" @click.prevent="$emit('section', 'guide')"
                >Lihat cara melapor<ArrowRight :size="17"
              /></a>
            </div>
            <div class="public-trust">
              <LockKeyhole :size="15" />Akses laporan dibatasi sesuai kewenangan
            </div>
          </div>
          <aside class="public-illustration" aria-label="Catatan sebelum melapor">
            <span class="folder-tab">PANDUAN PELAPOR</span>
            <div class="public-paper">
              <div class="paper-masthead"><span>WBS / UNEJ</span><span>CATATAN 01</span></div>
              <h2>Sebelum<br />Anda mengirim.</h2>
              <ol>
                <li>
                  <span>01</span>
                  <div>
                    <strong>Ceritakan kejadiannya.</strong>
                    <p>Apa yang terjadi, kapan, di mana, dan siapa yang terlibat.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Siapkan informasi pendukung.</strong>
                    <p>Bukti yang tersedia atau keterangan sumber informasi.</p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Gunakan email yang aktif.</strong>
                    <p>Untuk verifikasi akun dan pemberitahuan perkembangan laporan.</p>
                  </div>
                </li>
              </ol>
              <a href="/guide" @click.prevent="$emit('section', 'guide')"
                >Baca panduan lengkap<ArrowUpRight :size="16"
              /></a>
            </div>
            <span class="folder-caption">Laporan yang rinci membantu proses penelaahan.</span>
          </aside>
        </section>
        <section class="public-values" aria-label="Tentang layanan">
          <article>
            <span class="service-index">I.</span>
            <h2>Berangkat dari fakta</h2>
            <p>
              Susun kronologi dan informasi pendukung agar laporan dapat ditelaah dengan cermat.
            </p>
          </article>
          <article>
            <span class="service-index">II.</span>
            <h2>Tidak dipublikasikan</h2>
            <p>Laporan hanya tersedia bagi pelapor dan petugas yang memiliki hak akses perkara.</p>
          </article>
          <article>
            <span class="service-index">III.</span>
            <h2>Ada catatan penanganan</h2>
            <p>Ikuti perkembangan, jawab klarifikasi, dan baca jawaban resmi dalam satu tempat.</p>
          </article>
        </section>
        <section
          id="statistics"
          class="public-statistics"
          aria-labelledby="statistics-title"
          :aria-busy="statisticsStatus === 'pending'"
        >
          <div class="public-section-heading">
            <div>
              <span class="public-eyebrow">GAMBARAN PELAPORAN</span>
              <h2 id="statistics-title">Setiap laporan berarti.</h2>
            </div>
            <p>
              Ringkasan laporan yang telah dikirim. Data ditampilkan secara agregat tanpa identitas
              dan isi perkara.
            </p>
          </div>
          <div v-if="statisticsStatus === 'pending'" class="statistics-message" role="status">
            Memuat statistik laporan...
          </div>
          <div v-else-if="statisticsError" class="statistics-message" role="status">
            <p>Statistik laporan belum dapat dimuat.</p>
            <button type="button" class="button secondary" @click="refreshStatistics()">
              Coba lagi<ArrowRight :size="16" />
            </button>
          </div>
          <template v-else-if="statistics">
            <div class="statistics-cards">
              <article v-for="card in statisticCards" :key="card.label">
                <component :is="card.icon" :size="20" aria-hidden="true" /><strong>{{
                  number(card.value)
                }}</strong
                ><span>{{ card.label }}</span>
              </article>
            </div>
            <PublicStatisticsCharts :statistics="statistics" />
            <div class="category-chart">
              <div class="chart-intro">
                <span class="chart-symbol"
                  ><ChartNoAxesCombined :size="27" aria-hidden="true"
                /></span>
                <h3>Laporan per kategori</h3>
                <p>Distribusi seluruh laporan terkirim berdasarkan kategori pelanggaran.</p>
                <small>Draf tidak termasuk dalam statistik.</small>
              </div>
              <div v-if="!statistics.total" class="chart-empty">
                <Files :size="32" aria-hidden="true" /><strong>Belum ada laporan terkirim</strong>
                <p>Grafik akan tampil setelah laporan pertama dikirim.</p>
              </div>
              <ul
                v-else
                class="category-bars"
                aria-label="Jumlah dan persentase laporan per kategori"
              >
                <li v-for="(category, index) in chartCategories" :key="category.name">
                  <div class="bar-label">
                    <span>{{ category.name }}</span
                    ><strong
                      >{{ number(category.count) }}
                      <small>({{ percentage(category.count) }}%)</small></strong
                    >
                  </div>
                  <div class="bar-track" aria-hidden="true">
                    <span
                      :style="{
                        width: `${(category.count / chartMax) * 100}%`,
                        opacity: 1 - index * 0.09,
                      }"
                    ></span>
                  </div>
                </li>
              </ul>
            </div>
            <p class="statistics-note">
              Seluruh periode &middot; Diperbarui
              {{
                new Date(statistics.updatedAt).toLocaleString('id-ID', {
                  timeZone: 'Asia/Jakarta',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              }}
              WIB &middot; Jumlah laporan bukan jumlah pelanggaran yang terbukti.
            </p>
          </template>
        </section>
        <section id="guide" class="public-section" aria-labelledby="guide-title">
          <div class="public-section-heading">
            <div>
              <span class="public-eyebrow">02 / PROSES PELAPORAN</span>
              <h2 id="guide-title">Alur pelaporan</h2>
            </div>
            <p>Empat langkah untuk mengirim laporan dan mengikuti perkembangannya.</p>
          </div>
          <ol class="public-steps">
            <li v-for="(step, index) in steps" :key="step[0]">
              <span class="public-step-number">0{{ index + 1 }}</span>
              <h3>{{ step[0] }}</h3>
              <p>{{ step[1] }}</p>
            </li>
          </ol>
        </section>
        <section id="privacy" class="public-privacy" aria-labelledby="privacy-title">
          <div class="privacy-symbol"><ShieldCheck :size="37" /></div>
          <div>
            <span class="public-eyebrow">03 / AKSES INFORMASI</span>
            <h2 id="privacy-title">Kerahasiaan & akses informasi</h2>
            <p>
              Draf hanya terlihat oleh pemiliknya. Laporan yang dikirim diberikan kepada petugas
              sesuai kewenangan dan penugasan. Identitas, kronologi, dan bukti bukan informasi
              publik.
            </p>
            <p>
              Pilihan kerahasiaan tidak berarti laporan anonim. Sampaikan data seperlunya dan
              hindari mencantumkan informasi pribadi yang tidak berkaitan dengan kejadian.
            </p>
          </div>
        </section>
        <section id="help" class="public-section public-help" aria-labelledby="help-title">
          <div class="public-help-intro">
            <span class="public-eyebrow">04 / TANYA JAWAB</span>
            <h2 id="help-title">Pusat bantuan</h2>
            <p>
              Temukan jawaban tentang akun, bukti, dan proses pelaporan sebelum mengirim laporan.
            </p>
            <div
              v-if="site.helpEmail || site.helpPhone || site.helpAddress"
              class="public-contact configured-contact"
            >
              <HelpCircle :size="21" />
              <div>
                <p v-if="site.helpEmail">
                  <a :href="`mailto:${site.helpEmail}`">{{ site.helpEmail }}</a>
                </p>
                <p v-if="site.helpPhone">
                  <a :href="`tel:${site.helpPhone.replace(/[^+0-9]/g, '')}`">{{
                    site.helpPhone
                  }}</a>
                </p>
                <p v-if="site.helpAddress">{{ site.helpAddress }}</p>
              </div>
            </div>
            <div v-else class="public-contact">
              <HelpCircle :size="21" />
              <p>
                Kontak resmi verifikator/pemeriksa akan ditampilkan setelah ditetapkan oleh
                Universitas Jember.
              </p>
            </div>
          </div>
          <div class="public-faq">
            <details v-for="faq in faqs" :key="faq[0]">
              <summary>{{ faq[0] }}</summary>
              <p>{{ faq[1] }}</p>
            </details>
          </div>
        </section>
        <section class="public-cta">
          <div>
            <h2>Sudah pernah mengirim laporan?</h2>
            <p>Laporkan kejadian tanpa login dan simpan nomor tiket untuk memantau penanganan.</p>
          </div>
          <a href="/reports/new" class="button public-primary" @click.prevent="$emit('login')"
            >Laporkan<ArrowRight :size="17"
          /></a>
        </section>
      </template>
      <section v-else class="public-auth-layout" aria-label="Akses akun WBS">
        <div class="public-auth-intro">
          <span class="public-eyebrow">AKSES PETUGAS WBS</span>
          <h1>Pengelolaan aduan<br />untuk petugas.</h1>
          <p>
            Masuk dengan akun petugas untuk memverifikasi laporan dan mengelola penanganan aduan.
          </p>
          <ul>
            <li><CheckCircle2 :size="18" />Simpan laporan sebagai draf privat</li>
            <li><CheckCircle2 :size="18" />Pantau status dan riwayat penanganan</li>
            <li><CheckCircle2 :size="18" />Baca jawaban resmi melalui portal</li>
          </ul>
          <a href="/" class="public-text-link" @click.prevent="$emit('home')"
            >Kembali ke beranda<ArrowRight :size="16"
          /></a>
        </div>
        <slot name="auth" />
      </section>
    </main>
    <footer class="public-footer">
      <a href="/login">Akses petugas</a>
      <span>© {{ new Date().getFullYear() }} {{ site.institutionName }} · {{ site.tagline }}</span>
      <div>
        <a href="/help" @click.prevent="$emit('section', 'help')">Pusat bantuan</a
        ><a href="/privacy" @click.prevent="$emit('section', 'privacy')">Kerahasiaan</a>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.public-statistics {
  padding: 56px 0;
  border-bottom: 1px solid #d5dbc8;
}
.statistics-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin: 30px 0 22px;
}
.statistics-cards article {
  display: grid;
  gap: 12px;
  padding: 24px;
  background: #f2f5ed;
  border: 1px solid #dce4d5;
  border-radius: 12px;
  color: #476349;
}
.statistics-cards article:first-child {
  background: #274c39;
  color: #f4f7ec;
  border-color: #274c39;
}
.statistics-cards strong {
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1;
  font-family: 'Manrope Variable', sans-serif;
}
.statistics-cards span {
  font-size: 12px;
}
.category-chart {
  display: grid;
  grid-template-columns: minmax(200px, 0.8fr) minmax(0, 1.6fr);
  gap: 40px;
  padding: 32px;
  border: 1px solid #dce4d5;
  border-radius: 12px;
  background: linear-gradient(120deg, #f7f9f3, #fff);
}
.chart-symbol {
  display: inline-flex;
  padding: 12px;
  background: #e6eddc;
  border-radius: 12px;
  margin-bottom: 18px;
  color: #36593d;
}
.chart-intro h3 {
  font-size: 21px;
  margin: 0 0 12px;
}
.chart-intro p,
.chart-empty p {
  font-size: 13px;
  line-height: 1.8;
  color: #62705a;
}
.chart-intro small {
  display: block;
  margin-top: 18px;
  font-size: 11px;
  color: #62705a;
}
.category-bars {
  display: grid;
  gap: 22px;
  list-style: none;
  margin: 0;
  padding: 0;
  align-content: center;
}
.bar-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  font-size: 12px;
  margin-bottom: 9px;
}
.bar-label span {
  overflow-wrap: anywhere;
}
.bar-label strong {
  white-space: nowrap;
}
.bar-label small {
  font-weight: 400;
  color: #62705a;
}
.bar-track {
  height: 12px;
  border-radius: 20px;
  background: #e6ecdf;
  overflow: hidden;
}
.bar-track > span {
  display: block;
  height: 100%;
  min-width: 3px;
  border-radius: inherit;
  background: linear-gradient(90deg, #284e38, #709353);
}
.statistics-note {
  margin-top: 16px;
  color: #62705a;
  font-size: 11px;
  line-height: 1.8;
}
.chart-empty {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 12px;
  text-align: center;
  padding: 28px 10px;
  color: #62705a;
}
.statistics-message {
  padding: 30px 0;
  color: #62705a;
}
.statistics-message button {
  margin-top: 14px;
}
@media (max-width: 760px) {
  .statistics-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .statistics-cards article {
    padding: 20px;
  }
  .category-chart {
    grid-template-columns: minmax(0, 1fr);
    padding: 24px;
    gap: 28px;
  }
  .public-statistics {
    padding: 40px 0;
  }
}

.public-portal {
  --ink: #243d31;
  --paper: #fff;
  --accent: #89503e;
  background: var(--paper);
  min-height: 100vh;
  color: var(--ink);
}
.public-skip {
  position: absolute;
  top: -70px;
  left: 15px;
  background: white;
  padding: 12px;
  z-index: 100;
}
.public-skip:focus {
  top: 12px;
}
.public-header {
  color: #ffffff;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 27px 40px;
  display: flex;
  gap: 26px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #d5d7c9;
}
.public-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  color: #ffffff;
  text-decoration: none;
  flex-shrink: 0;
}
.public-brand-mark {
  display: grid;
  place-items: center;
  width: 43px;
  height: 48px;
  border: 1px solid #8b9b82;
  border-radius: 3px 3px 15px 15px;
}
.public-brand strong {
  display: block;
  font-size: 23px;
  letter-spacing: -0.04em;
  line-height: 1.1;
}
.public-brand small {
  display: block;
  margin-top: 5px;
  font-size: 8px;
  letter-spacing: 0.13em;
}
.public-header nav {
  display: flex;
  flex-wrap: wrap;
  flex-direction: row;
  gap: 30px;
  margin: 0;
  padding: 0;
}
.public-header nav a {
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  padding: 8px 0;
  transition: color 0.2s;
}
.public-footer a {
  font-size: 12px;
  text-decoration: none;
  color: #4f5d4b;
}
.public-header nav a:hover,
.public-header nav a:focus-visible {
  color: #f0d694;
  text-decoration: underline;
  text-underline-offset: 6px;
}
.public-header a:focus-visible {
  outline: 2px solid #f0d694;
  outline-offset: 5px;
}
.public-footer a:hover {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 5px;
}
.public-login {
  background: transparent;
  border: 1px solid #65785e;
  border-radius: 4px;
  box-shadow: none;
}
main.public-main {
  max-width: 1280px;
  padding: 0 40px;
  margin: auto;
}
.public-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.85fr);
  gap: 85px;
  align-items: center;
  padding: 80px 0 65px;
}
.public-kicker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 9px;
  letter-spacing: 0.1em;
  color: #77806b;
  font-weight: 600;
}
.public-kicker span {
  color: var(--accent);
  border-right: 1px solid #c8cbbd;
  padding-right: 12px;
}
.public-hero h1 {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(47px, 5.4vw, 78px);
  font-weight: 400;
  line-height: 1.06;
  letter-spacing: -0.055em;
  margin: 30px 0 25px;
}
.public-hero h1 em {
  color: #6c7757;
  font-weight: 400;
}
.public-hero-copy > p {
  font-size: 15px;
  line-height: 1.9;
  color: #5f6857;
  max-width: 475px;
}
.public-actions {
  display: flex;
  gap: 25px;
  flex-wrap: wrap;
  align-items: center;
  margin: 31px 0 35px;
}
.public-primary {
  background: #274b38;
  color: #fffdf5;
  border: 1px solid #274b38;
  border-radius: 4px;
  text-decoration: none;
  padding: 15px 22px;
  box-shadow: 0 3px 0 #163323;
}
.public-primary:hover {
  background: #173c2b;
  color: white;
}
.public-text-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid #a9b29a;
  padding: 7px 0;
}
.public-text-link:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.public-trust {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #78806e;
}
.public-illustration {
  position: relative;
  background: #64704e;
  padding: 30px 24px 21px;
  margin-top: 18px;
  border-radius: 0 5px 5px 5px;
  box-shadow: 9px 12px 0 #e4e0d1;
}
.folder-tab {
  position: absolute;
  left: 0;
  top: -25px;
  padding: 9px 20px 7px;
  background: #64704e;
  color: #f8f4e7;
  border-radius: 6px 14px 0 0;
  font-size: 8px;
  font-weight: 650;
  letter-spacing: 0.12em;
}
.public-paper {
  text-align: left;
  position: relative;
  background: #fffdf5;
  color: #354431;
  padding: 23px 26px 21px;
  border: 1px solid #eeecdf;
  box-shadow: 0 8px 15px #26341b25;
  transform: none;
}
.public-paper::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 45px;
  border: 2px solid #a9afa0;
  border-radius: 8px;
  right: 25px;
  top: -20px;
  transform: rotate(8deg);
}
.paper-masthead {
  display: flex;
  justify-content: space-between;
  font-size: 8px;
  letter-spacing: 0.12em;
  padding: 2px 0 14px;
  border-bottom: 1px solid #b8c0a8;
  color: #7b836e;
}
.public-paper h2 {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 35px;
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.04em;
  margin: 22px 0;
}
.public-paper ol {
  padding: 0;
  margin: 0;
  list-style: none;
}
.public-paper li {
  display: flex;
  gap: 13px;
  border-top: 1px solid #e0e3d4;
  padding: 15px 0;
}
.public-paper li > span {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  padding-top: 2px;
}
.public-paper li strong {
  font-size: 12px;
  font-weight: 650;
}
.public-paper li p {
  font-size: 11px;
  line-height: 1.75;
  color: #7c826f;
  margin-top: 5px;
}
.public-paper > a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid #b8c0a8;
  padding-top: 15px;
  color: #475a36;
  text-decoration: none;
  font-size: 11px;
  font-weight: 650;
}
.folder-caption {
  display: block;
  margin-top: 16px;
  font-size: 9px;
  color: #f0eedb;
  text-align: center;
}
.public-values {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid #aab49b;
  border-bottom: 1px solid #aab49b;
  padding: 28px 0;
}
.public-values article {
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr);
  column-gap: 12px;
  padding: 0 27px;
  border-left: 1px solid #d1d7c6;
}
.public-values article:first-child {
  padding-left: 0;
  border-left: 0;
}
.service-index {
  grid-row: span 2;
  font-family: Georgia, serif;
  font-style: italic;
  font-size: 19px;
  color: var(--accent);
}
.public-values h2 {
  font-size: 13px;
  margin: 2px 0 8px;
}
.public-values p,
.public-steps p {
  font-size: 12px;
  line-height: 1.85;
  color: #69725e;
}
.public-section {
  padding: 75px 0;
  scroll-margin-top: 25px;
}
.public-eyebrow {
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.12em;
  color: var(--accent);
}
.public-section h2,
.public-privacy h2,
.public-cta h2 {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 39px;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.04em;
  margin: 15px 0;
}
.public-section-heading {
  display: flex;
  justify-content: space-between;
  gap: 25px;
  align-items: end;
  margin-bottom: 35px;
}
.public-section-heading > p {
  max-width: 280px;
  font-size: 12px;
  line-height: 1.8;
  color: #707760;
}
.public-steps {
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 28px;
}
.public-steps li {
  padding: 20px 0 0;
  border-top: 2px solid #9aa58a;
}
.public-step-number {
  font-family: Georgia, serif;
  font-size: 36px;
  font-weight: 400;
  color: #9ca58b;
}
.public-steps h3 {
  font-size: 14px;
  line-height: 1.5;
  margin: 20px 0 12px;
}
.public-privacy {
  position: relative;
  padding: 40px;
  display: grid;
  grid-template-columns: 55px minmax(0, 1fr);
  gap: 25px;
  background: #e8e9db;
  border-left: 4px solid #7f8c69;
  scroll-margin-top: 25px;
}
.privacy-symbol {
  color: #64754e;
  padding-top: 8px;
}
.public-privacy h2 {
  font-size: 30px;
}
.public-privacy p {
  font-size: 13px;
  line-height: 1.9;
  color: #616f54;
  margin-top: 11px;
  max-width: 830px;
}
.public-help {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 85px;
}
.public-help-intro > p {
  color: #69725e;
  font-size: 13px;
  line-height: 1.9;
  max-width: 310px;
}
.public-contact {
  display: flex;
  align-items: start;
  gap: 10px;
  padding: 18px 0;
  border-top: 1px solid #c4cbb7;
  margin-top: 27px;
  color: #7a806c;
}
.public-contact svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.public-contact p {
  font-size: 11px;
  line-height: 1.8;
}
.public-faq details {
  border-bottom: 1px solid #cdd3c0;
  padding: 20px 0;
}
.public-faq details:first-child {
  padding-top: 0;
}
.public-faq summary {
  font-size: 13px;
  font-weight: 500;
  color: #35482f;
}
.public-faq details p {
  color: #6b755d;
  line-height: 1.9;
}
.public-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
  padding: 35px 0;
  border-top: 1px solid #aab49b;
  margin-bottom: 35px;
}
.public-cta h2 {
  font-size: 29px;
  margin: 0 0 12px;
}
.public-cta p {
  font-size: 12px;
  color: #6b755d;
  line-height: 1.8;
}
.public-footer {
  max-width: 1280px;
  padding: 26px 40px 35px;
  margin: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  font-size: 11px;
  color: #7a806c;
  border-top: 1px solid #d3d7c8;
}
.public-footer > div {
  display: flex;
  gap: 20px;
}
.public-footer small {
  width: 100%;
  font-size: 10px;
  color: #8c907f;
}
.public-auth-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 460px);
  gap: 70px;
  align-items: center;
  max-width: 1060px;
  margin: auto;
  padding: 55px 0 70px;
  min-height: 75vh;
}
.public-tracking-page {
  padding: 32px 0 55px;
  min-height: 70vh;
}
.public-tracking-page > a {
  margin-bottom: 28px;
}
.public-auth-intro h1 {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 47px;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.04em;
  margin: 22px 0;
}
.public-auth-intro > p {
  font-size: 14px;
  line-height: 1.9;
  color: #6b785f;
}
.public-auth-intro ul {
  list-style: none;
  padding: 0;
  margin: 30px 0;
}
.public-auth-intro li {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 17px 0;
  font-size: 12px;
  color: #58724b;
}
@media (max-width: 1000px) {
  .public-header {
    flex-wrap: wrap;
    gap: 18px;
  }
  .public-header nav {
    order: 3;
    width: 100%;
    justify-content: center;
  }
  .public-hero {
    gap: 38px;
    padding-top: 55px;
  }
  .public-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 28px;
  }
  .public-auth-layout {
    gap: 35px;
  }
  .public-paper {
    padding: 20px;
  }
  .public-paper h2 {
    font-size: 29px;
  }
}
@media (max-width: 700px) {
  .public-header {
    padding: 20px;
  }
  main.public-main {
    padding: 0 24px;
  }
  .public-hero {
    grid-template-columns: minmax(0, 1fr);
    gap: 42px;
    padding: 40px 0 45px;
  }
  .public-hero h1 {
    font-size: 58px;
  }
  .public-hero-copy > p {
    font-size: 14px;
  }
  .public-illustration {
    margin: 0 8px 0 0;
  }
  .public-values {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
    padding: 26px 0;
  }
  .public-values article,
  .public-values article:first-child {
    padding: 0 0 20px;
    border: 0;
    border-bottom: 1px solid #d5dbc8;
  }
  .public-values article:last-child {
    padding-bottom: 0;
    border: 0;
  }
  .public-section {
    padding: 45px 0;
  }
  .public-section-heading {
    display: block;
  }
  .public-section-heading > p {
    max-width: none;
    margin-top: 16px;
  }
  .public-help {
    grid-template-columns: minmax(0, 1fr);
    gap: 30px;
  }
  .public-privacy {
    padding: 25px;
    gap: 15px;
    grid-template-columns: minmax(0, 1fr);
  }
  .public-privacy h2 {
    font-size: 28px;
  }
  .public-cta {
    padding: 30px 0;
  }
  .public-footer {
    padding: 25px 24px;
  }
  .public-auth-layout {
    grid-template-columns: minmax(0, 1fr);
    padding: 35px 0 45px;
    gap: 28px;
  }
  .public-auth-intro h1 {
    font-size: 36px;
  }
  .public-auth-intro ul {
    display: none;
  }
}
@media (max-width: 400px) {
  .public-header nav {
    gap: 12px;
    flex-wrap: wrap;
  }
  .public-header nav a {
    font-size: 11px;
  }
  .public-brand small {
    font-size: 8px;
  }
  .public-hero h1 {
    font-size: 48px;
  }
  .public-actions {
    gap: 17px;
  }
  .public-trust {
    font-size: 10px;
  }
  .public-steps {
    grid-template-columns: minmax(0, 1fr);
  }
  .public-steps li {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 0 20px;
    padding-top: 20px;
  }
  .public-step-number {
    grid-row: span 2;
    font-size: 29px;
  }
  .public-steps h3 {
    margin: 0 0 8px;
  }
}
.public-nav-toggle {
  display: none;
}
@media (max-width: 700px) {
  .public-header .public-brand {
    margin-right: auto;
  }
  .public-header .public-nav-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    order: 2;
    width: 44px;
    height: 44px;
    color: #ffffff;
    border: 1px solid #d6b56680;
    border-radius: 8px;
  }
  .public-header .public-nav-toggle:hover {
    background: #ffffff18;
  }
  .public-header .public-nav-toggle:focus-visible {
    outline: 2px solid #f0d694;
    outline-offset: 4px;
  }
  .public-header .public-login {
    order: 1;
  }
  .public-header nav {
    display: none;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    width: 100%;
    order: 3;
    padding-top: 14px;
    border-top: 1px solid #ffffff30;
  }
  .public-header nav.is-open {
    display: flex;
  }
  .public-header nav a {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 10px 12px;
    border-radius: 6px;
  }
  .public-header nav a:hover {
    background: #ffffff0d;
  }
}
</style>
