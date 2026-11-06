<script setup lang="ts">
import {
  Clock,
  FileText,
  MessageSquare,
  ShieldCheck,
  Pause,
  Play,
  RefreshCw,
  LockKeyhole,
  ArrowRight,
} from '@lucide/vue';
import type { Report, Stage } from '@wbs/contracts';
import { stageLabels } from '@wbs/contracts';
import { formatDateTime } from '../utils/date-time';

const props = defineProps<{ report: Report }>();
const entries = computed(() =>
  [...(props.report.events ?? [])]
    .map((event, index) => ({ ...event, index }))
    .sort(
      (a, b) =>
        (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || a.index - b.index,
    ),
);
const labels: Record<
  string,
  { title: string; category: string; icon: typeof Clock; tone: string }
> = {
  SUBMIT: { title: 'Laporan dikirim', category: 'Pelaporan', icon: FileText, tone: 'green' },
  ADVANCE: {
    title: 'Verifikasi awal dimulai',
    category: 'Verifikasi',
    icon: ShieldCheck,
    tone: 'green',
  },
  CLARIFY: {
    title: 'Klarifikasi diminta',
    category: 'Klarifikasi',
    icon: MessageSquare,
    tone: 'amber',
  },
  RESPOND: {
    title: 'Jawaban klarifikasi disampaikan',
    category: 'Klarifikasi',
    icon: MessageSquare,
    tone: 'green',
  },
  STATUS_UPDATED: {
    title: 'Status laporan diperbarui',
    category: 'Perubahan status',
    icon: ArrowRight,
    tone: 'green',
  },
  PROPOSE_ASSIGNMENT: {
    title: 'Penugasan pemeriksa diusulkan',
    category: 'Penugasan',
    icon: FileText,
    tone: 'blue',
  },
  DECIDE: {
    title: 'Keputusan pejabat dicatat',
    category: 'Keputusan',
    icon: ShieldCheck,
    tone: 'blue',
  },
  FINDING: {
    title: 'Hasil pemeriksaan diserahkan',
    category: 'Pemeriksaan',
    icon: FileText,
    tone: 'green',
  },
  REVIEW_FINDING: {
    title: 'Hasil pemeriksaan dikembalikan',
    category: 'Review hasil',
    icon: RefreshCw,
    tone: 'amber',
  },
  PROPOSE_RESULT: {
    title: 'Hasil dan tindak lanjut diusulkan',
    category: 'Tindak lanjut',
    icon: FileText,
    tone: 'blue',
  },
  EXECUTE: {
    title: 'Pelaksanaan tindak lanjut diserahkan',
    category: 'Pelaksanaan',
    icon: FileText,
    tone: 'green',
  },
  REVIEW_EXECUTION: {
    title: 'Pelaksanaan tindak lanjut ditelaah',
    category: 'Verifikasi',
    icon: ShieldCheck,
    tone: 'blue',
  },
  PROPOSE_CLOSURE: {
    title: 'Penutupan laporan diusulkan',
    category: 'Penutupan',
    icon: FileText,
    tone: 'blue',
  },
  SUSPEND: {
    title: 'Penanganan laporan ditunda',
    category: 'Penundaan',
    icon: Pause,
    tone: 'amber',
  },
  RESUME: {
    title: 'Penanganan laporan dilanjutkan',
    category: 'Pelanjutan',
    icon: Play,
    tone: 'green',
  },
  REQUEST_REOPEN: {
    title: 'Pembukaan kembali diminta',
    category: 'Pembukaan kembali',
    icon: RefreshCw,
    tone: 'amber',
  },
  PROPOSE_REOPEN: {
    title: 'Pembukaan kembali diusulkan',
    category: 'Pembukaan kembali',
    icon: RefreshCw,
    tone: 'blue',
  },
  CONFLICT: {
    title: 'Konflik kepentingan dinyatakan',
    category: 'Akses perkara',
    icon: LockKeyhole,
    tone: 'amber',
  },
};
const description = (action: string) =>
  labels[action] ?? {
    title: 'Aktivitas perkara dicatat',
    category: 'Aktivitas',
    icon: Clock,
    tone: 'blue',
  };
</script>

<template>
  <aside class="panel report-timeline" aria-label="Timeline perkembangan laporan">
    <header class="rt-header">
      <div class="rt-eyebrow"><Clock :size="15" aria-hidden="true" /> JEJAK PENANGANAN</div>
      <h3>Perkembangan laporan</h3>
      <p>Riwayat terbaru ditampilkan paling atas. Seluruh waktu menggunakan WIB.</p>
      <div class="rt-status">
        <span>Status saat ini</span
        ><strong>{{ stageLabels[report.stage as Stage] || report.stage }}</strong>
      </div>
    </header>
    <div class="rt-summary">
      <span>{{ entries.length }} aktivitas tercatat</span><span>Terbaru dahulu</span>
    </div>
    <ol v-if="entries.length" class="rt-list">
      <li
        v-for="(entry, index) in entries"
        :key="entry.index"
        class="rt-entry"
        :class="`rt-${description(entry.action).tone}`"
      >
        <span class="rt-marker"
          ><component :is="description(entry.action).icon" :size="16" aria-hidden="true"
        /></span>
        <article class="rt-card" :class="{ 'rt-latest': index === 0 }">
          <div class="rt-meta">
            <span>{{ description(entry.action).category }}</span
            ><span v-if="index === 0" class="rt-new">Terbaru</span>
          </div>
          <h4>{{ description(entry.action).title }}</h4>
          <time :datetime="entry.createdAt">{{ formatDateTime(entry.createdAt) }}</time>
          <p>{{ entry.reason }}</p>
        </article>
      </li>
    </ol>
    <div v-else class="rt-empty">
      <Clock :size="25" aria-hidden="true" /><strong>Belum ada aktivitas</strong>
      <p>Perkembangan yang dapat Anda akses akan muncul di sini setelah aktivitas dicatat.</p>
    </div>
    <footer class="rt-footer">
      <LockKeyhole :size="15" aria-hidden="true" />
      <p>Riwayat ditampilkan sesuai hak akses Anda.</p>
    </footer>
  </aside>
</template>

<style scoped>
.report-timeline {
  padding: 24px;
  min-width: 0;
  align-self: start;
}
.rt-eyebrow {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #4e6e58;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.09em;
}
.rt-header h3 {
  margin: 10px 0 7px;
  font-size: 19px;
  letter-spacing: -0.025em;
  color: #233b2d;
}
.rt-header > p,
.rt-empty p {
  font-size: 12px;
  line-height: 1.7;
  color: #657267;
}
.rt-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 18px;
  padding: 12px;
  border: 1px solid #dce7db;
  border-radius: 10px;
  background: #f3f8f1;
  font-size: 11px;
  color: #536455;
}
.rt-status strong {
  color: #2a593b;
  font-size: 12px;
}
.rt-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 5px;
  margin: 24px 0 18px;
  font-size: 10px;
  color: #6b776d;
}
.rt-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.rt-entry {
  position: relative;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 12px;
  padding-bottom: 20px;
}
.rt-entry:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 32px;
  bottom: 0;
  left: 15px;
  width: 2px;
  background: #e2e9e0;
}
.rt-marker {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #edf4e9;
  color: #39734b;
  border: 1px solid #d8e7d4;
}
.rt-blue .rt-marker {
  background: #eef3fa;
  color: #42618a;
  border-color: #dbe4f2;
}
.rt-amber .rt-marker {
  background: #fff6e6;
  color: #926620;
  border-color: #f2e4c7;
}
.rt-card {
  min-width: 0;
  padding: 13px;
  border: 1px solid #e5e9e1;
  border-radius: 12px;
  background: #fff;
}
.rt-latest {
  background: #f8fbf6;
  border-color: #c9dcc3;
}
.rt-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 10px;
  color: #677668;
}
.rt-new {
  background: #e4eedf;
  color: #356045;
  border-radius: 20px;
  padding: 3px 7px;
  font-weight: 650;
}
.rt-card h4 {
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.5;
  color: #293d30;
}
.rt-card time {
  display: block;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  line-height: 1.6;
  color: #627064;
}
.rt-card p {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px solid #e9ede5;
  font-size: 12px;
  line-height: 1.75;
  color: #4d5e50;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.rt-footer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-top: 1px solid #e4e9df;
  padding-top: 15px;
  color: #647565;
}
.rt-footer svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.rt-footer p {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
}
.rt-empty {
  display: grid;
  gap: 10px;
  justify-items: center;
  text-align: center;
  padding: 24px 10px 32px;
  color: #637963;
}
.rt-empty strong {
  font-size: 13px;
}
@media (max-width: 480px) {
  .report-timeline {
    padding: 18px;
  }
  .rt-entry {
    gap: 9px;
  }
  .rt-card {
    padding: 11px;
  }
}
</style>
