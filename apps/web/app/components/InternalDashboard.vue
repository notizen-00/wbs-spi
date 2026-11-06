<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, ChevronRight, Files, LoaderCircle, ShieldCheck } from '@lucide/vue';
import { stageLabels, type Report, type User } from '@wbs/contracts';
const props = defineProps<{ user: User; reports: Report[]; loading: boolean }>();
defineEmits<{ open: [report: Report]; queue: [] }>();
const roles = {
  MANAGER: [
    'Pengelola',
    'Verifikasi laporan masuk, kelola penugasan, dan tinjau hasil pemeriksaan.',
  ],
  INVESTIGATOR: [
    'Pemeriksa',
    'Tangani pemeriksaan yang ditugaskan dan dokumentasikan temuan perkara.',
  ],
  OFFICIAL: [
    'Pejabat berwenang',
    'Tinjau usulan penugasan, hasil pemeriksaan, dan penutupan sesuai kewenangan.',
  ],
  EXECUTOR: [
    'Pelaksana tindak lanjut',
    'Laksanakan tindak lanjut yang ditugaskan dan lengkapi bukti pelaksanaannya.',
  ],
  ADMIN: [
    'Administrator teknis',
    'Kelola operasional teknis sistem. Akun administrator tidak memiliki akses ke isi perkara.',
  ],
  REPORTER: ['Pelapor', ''],
};
const role = computed(() => roles[props.user.role]);
const active = computed(() =>
  props.reports.filter((r) => !['COMPLETED', 'CLOSED', 'DRAFT'].includes(r.stage)),
);
</script>

<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">PORTAL INTERNAL ? {{ role[0] }}</div>
      <h1>Dashboard</h1>
      <p>{{ role[1] }}</p>
    </div>
    <button v-if="user.role !== 'ADMIN'" class="button" @click="$emit('queue')">
      Buka antrean<ArrowRight :size="17" />
    </button>
  </div>
  <section v-if="user.role === 'ADMIN'" class="panel">
    <div class="empty">
      <ShieldCheck :size="32" />
      <h3>Administrasi teknis</h3>
      <p>
        Akses teknis dipisahkan dari penanganan aduan. Pemeriksaan dan keputusan perkara menjadi
        kewenangan petugas yang ditugaskan.
      </p>
    </div>
  </section>
  <template v-else>
    <div class="stats-grid internal-stats">
      <article class="stat">
        <div><span>Perkara dalam akses</span><Files :size="19" /></div>
        <strong>{{ reports.length }}</strong
        ><small>Daftar terbaru sesuai penugasan</small>
      </article>
      <article class="stat">
        <div><span>Dalam penanganan</span></div>
        <strong>{{ active.length }}</strong
        ><small>Perkara aktif dalam akses Anda</small>
      </article>
      <article class="stat">
        <div><span>Selesai atau ditutup</span></div>
        <strong>{{
          reports.filter((r) => ['COMPLETED', 'CLOSED'].includes(r.stage)).length
        }}</strong
        ><small>Penanganan telah berakhir</small>
      </article>
    </div>
    <section class="panel">
      <div class="panel-title">
        <div>
          <h3>Perkara terbaru</h3>
          <p>Buka perkara untuk melihat dokumen dan tindakan sesuai peran Anda.</p>
        </div>
      </div>
      <div v-if="loading" class="empty">
        <LoaderCircle class="spin" />
        <p>Memuat perkara...</p>
      </div>
      <button
        v-for="r in loading ? [] : reports.slice(0, 6)"
        :key="r.id"
        class="report-row"
        @click="$emit('open', r)"
      >
        <span class="report-icon"><Files :size="20" /></span
        ><span class="report-copy"
          ><strong>{{ r.payload.title || 'Perkara' }}</strong
          ><small>{{ r.number || 'Nomor belum tersedia' }}</small></span
        ><span class="badge" :class="r.stage.toLowerCase()">{{ stageLabels[r.stage] }}</span
        ><ChevronRight :size="17" />
      </button>
      <div v-if="!loading && !reports.length" class="empty">
        <Files :size="30" />
        <h4>Belum ada perkara dalam akses Anda</h4>
        <p>Perkara akan tampil setelah Anda mendapat penugasan aktif.</p>
      </div>
      <div class="panel-footer">
        <ShieldCheck :size="15" />Hanya perkara sesuai hak akses yang ditampilkan. Ringkasan
        mengikuti daftar terbaru, maksimal 50 perkara.
      </div>
    </section>
  </template>
</template>

<style scoped>
.internal-stats {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
@media (max-width: 600px) {
  .internal-stats {
    grid-template-columns: 1fr;
  }
}
</style>
