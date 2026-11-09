<script setup lang="ts">
import { ArrowLeft, ArrowRight, BookOpen, KeyRound } from '@lucide/vue';
defineProps<{ password: string | null }>();
defineEmits<{ home: []; login: [] }>();
const accounts = [
  [
    'Pelapor',
    'pelapor@example.test',
    'Membuat laporan, melampirkan bukti, menjawab klarifikasi, dan menerima jawaban resmi.',
  ],
  [
    'Pengelola',
    'pengelola@example.test',
    'Memverifikasi laporan, meminta klarifikasi, mengusulkan penugasan, dan memverifikasi tindak lanjut.',
  ],
  [
    'Pejabat',
    'pejabat@example.test',
    'Menyetujui penugasan, hasil pemeriksaan, dan penutupan sesuai mandat.',
  ],
  [
    'Pemeriksa',
    'pemeriksa@example.test',
    'Memeriksa perkara yang ditugaskan dan menyerahkan hasil serta rekomendasi.',
  ],
  [
    'Pelaksana',
    'pelaksana@example.test',
    'Melaksanakan rekomendasi dan menyerahkan bukti tindak lanjut.',
  ],
];
const steps = [
  [
    'Pelapor',
    'Buat dan kirim laporan',
    'Masuk sebagai pelapor. Buat laporan baru, lengkapi 5W+1H, unggah bukti dan tunggu pemindaian selesai. Kirim laporan lalu simpan nomor dan kode pelacakannya.',
  ],
  [
    'Pengelola → Pelapor',
    'Verifikasi dan klarifikasi',
    'Pengelola membuka laporan masuk dan memulai verifikasi. Jika informasi kurang, minta klarifikasi. Ganti akun ke pelapor untuk menjawab, lalu kembali ke pengelola.',
  ],
  [
    'Pengelola → Pejabat',
    'Setujui penugasan pemeriksa',
    'Pengelola mengusulkan pemeriksa beserta ringkasan perkara. Pejabat meninjau dan menyetujui usulan sesuai mandatnya. Pemeriksa kemudian mendapat akses perkara.',
  ],
  [
    'Pemeriksa',
    'Serahkan hasil pemeriksaan',
    'Buka perkara yang ditugaskan. Catat hasil pemeriksaan dan rekomendasi tindak lanjut, kemudian serahkan hasil untuk ditinjau.',
  ],
  [
    'Pengelola → Pejabat',
    'Setujui hasil dan tindak lanjut',
    'Pengelola meninjau hasil, mengusulkan pelaksana serta instruksi perbaikan. Pejabat menyetujui hasil dan tindak lanjut sehingga tugas pelaksana terbentuk.',
  ],
  [
    'Pelaksana',
    'Kerjakan dan serahkan tugas',
    'Buka tugas, lakukan tindak lanjut, dan unggah bukti pelaksanaan. Tunggu bukti lolos pemindaian, lalu serahkan tugas.',
  ],
  [
    'Pengelola → Pejabat',
    'Verifikasi dan tutup perkara',
    'Pengelola memverifikasi hasil pelaksanaan lalu mengusulkan penutupan beserta jawaban resmi. Pejabat meninjau dan menyetujui penutupan.',
  ],
  [
    'Pelapor',
    'Baca hasil akhir',
    'Masuk kembali sebagai pelapor. Buka laporan berstatus Selesai, baca jawaban resmi dan periksa timeline penanganan yang tersedia untuk pelapor.',
  ],
];
</script>

<template>
  <main class="demo-guide">
    <button class="demo-back" @click="$emit('home')">
      <ArrowLeft :size="17" />Kembali ke portal
    </button>
    <header class="demo-heading">
      <span class="demo-tag"><BookOpen :size="15" />DEVELOPMENT / DEMO</span>
      <h1>Satu laporan.<br />Lima peran, sampai selesai.</h1>
      <p>
        Panduan mencoba alur WBS dari pengiriman laporan hingga jawaban resmi. Gunakan data sintetis
        selama demonstrasi.
      </p>
      <button class="button" @click="$emit('login')">Buka portal<ArrowRight :size="17" /></button>
    </header>
    <section aria-labelledby="demo-accounts">
      <div class="demo-section-heading">
        <span>01</span>
        <h2 id="demo-accounts">Akun untuk mencoba</h2>
      </div>
      <div class="demo-password">
        <KeyRound :size="21" />
        <div>
          <strong>Password akun demo</strong>
          <p v-if="password">
            <code>{{ password }}</code>
          </p>
          <p v-else>
            Belum dipublikasikan. Gunakan password yang ditetapkan melalui
            <code>SEED_PASSWORD</code> saat seed, atau minta kepada pengelola demo.
          </p>
          <small v-if="password"
            >Berlaku jika akun dibuat dengan password ini. Seed ulang tidak mengganti password akun
            yang sudah ada.</small
          >
        </div>
      </div>
      <div class="demo-accounts">
        <article v-for="[role, email, description] in accounts" :key="email">
          <h3>{{ role }}</h3>
          <code>{{ email }}</code>
          <p>{{ description }}</p>
        </article>
      </div>
      <aside class="demo-admin">
        <strong>Super admin · pengaturan aplikasi</strong>
        <p>
          Akun ini dibuat terpisah melalui <code>db:seed:admin</code>. Gunakan email dan password
          yang Anda tentukan saat seed. Super admin mengelola kategori, logo, dan identitas situs;
          tidak otomatis mendapat akses perkara. Kredensialnya tidak ditampilkan di halaman ini.
        </p>
      </aside>
    </section>
    <section aria-labelledby="demo-flow">
      <div class="demo-section-heading">
        <span>02</span>
        <h2 id="demo-flow">Jalankan alurnya</h2>
      </div>
      <p>
        Mulai dengan laporan baru. Keluar dari akun yang aktif sebelum berganti peran, atau gunakan
        profil browser terpisah agar sesi tidak tertukar.
      </p>
      <ol class="demo-flow">
        <li v-for="([role, title, description], index) in steps" :key="title">
          <span class="demo-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <div>
            <span class="demo-role">{{ role }}</span>
            <h3>{{ title }}</h3>
            <p>{{ description }}</p>
          </div>
        </li>
      </ol>
    </section>
    <aside class="demo-note">
      <strong>Sudah menjalankan seed kasus lengkap?</strong>
      <p>
        Perkara dari <code>db:seed:case</code> sudah berstatus Selesai. Gunakan untuk meninjau
        timeline, bukti, keputusan, dan jawaban resmi sesuai hak akses tiap akun. Untuk mencoba
        tombol tindakan dari awal, buat laporan baru.
      </p>
      <p>
        Jika tindakan tidak tersedia, periksa role, penugasan, mandat pejabat, status perkara, dan
        hasil pemindaian bukti.
      </p>
    </aside>
  </main>
</template>

<style scoped>
.demo-guide {
  width: min(1100px, 100%);
  margin: auto;
  padding: 32px clamp(20px, 5vw, 64px) 72px;
  color: #19352f;
  background: #fff;
}
.demo-back {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  padding: 8px 0;
}
.demo-heading {
  padding: 48px 0 40px;
  border-bottom: 1px solid #dce5df;
  margin-bottom: 36px;
}
.demo-tag,
.demo-role {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #41715e;
}
h1 {
  font-size: clamp(34px, 5vw, 56px);
  line-height: 1.12;
  letter-spacing: -0.04em;
  margin: 20px 0;
}
h2 {
  font-size: 25px;
  margin: 0;
}
h3 {
  font-size: 18px;
  margin: 8px 0;
}
p {
  line-height: 1.75;
  color: #53675f;
  margin: 10px 0;
}
.demo-heading > p {
  max-width: 640px;
  margin-bottom: 24px;
}
.demo-section-heading {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 32px 0 22px;
}
.demo-section-heading > span {
  font-family: monospace;
  color: #6b8578;
  font-size: 18px;
}
.demo-password {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 20px;
  background: #f2f7f3;
  border-left: 3px solid #3e745b;
}
.demo-password svg {
  flex-shrink: 0;
}
.demo-password p {
  margin: 6px 0;
}
.demo-password small {
  color: #53675f;
  line-height: 1.6;
  display: block;
}
code {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.demo-password code {
  font-size: 15px;
}
.demo-accounts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 30px;
  margin-top: 16px;
}
.demo-accounts article {
  padding: 18px 0;
  border-bottom: 1px solid #dce5df;
}
.demo-accounts p {
  font-size: 14px;
}
.demo-admin,
.demo-note {
  padding: 24px;
  background: #faf8f1;
  margin-top: 28px;
}
.demo-admin p,
.demo-note p {
  font-size: 14px;
}
.demo-flow {
  list-style: none;
  padding: 0;
  margin: 28px 0;
}
.demo-flow li {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 20px;
  position: relative;
  padding-bottom: 30px;
}
.demo-flow li:not(:last-child):before {
  content: '';
  position: absolute;
  left: 23px;
  top: 49px;
  bottom: 5px;
  width: 1px;
  background: #dce5df;
}
.demo-number {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: 1px solid #cadbcf;
  border-radius: 50%;
  font-family: monospace;
  color: #356347;
  background: #f5f9f5;
}
.demo-role {
  font-size: 11px;
}
.demo-flow h3 {
  margin: 6px 0;
}
.demo-flow p {
  margin: 6px 0;
  font-size: 14px;
}
@media (max-width: 600px) {
  .demo-accounts {
    grid-template-columns: 1fr;
  }
  .demo-heading {
    padding-top: 30px;
  }
  .demo-flow li {
    gap: 14px;
  }
  .demo-admin,
  .demo-note {
    padding: 18px;
  }
}
</style>
