<script setup lang="ts">
import { Search, LoaderCircle } from '@lucide/vue';
import { formatDateTime } from '../utils/date-time';
import type { Report } from '@wbs/contracts';
const code = ref(''),
  captchaToken = ref(''),
  busy = ref(false),
  error = ref('');
interface TrackingStatus {
  label: string;
  lifecycle: string;
  updatedAt: string;
  report: Report;
  officialResponses: { content: string; outcome: string; createdAt: string }[];
}
const result = ref<TrackingStatus | null>(null);
const captcha = ref<{ reset: () => void } | null>(null);
watch(code, () => {
  result.value = null;
  error.value = '';
});
async function check() {
  if (busy.value || !captchaToken.value) return;
  busy.value = true;
  result.value = null;
  error.value = '';
  try {
    result.value = await $fetch<TrackingStatus>('/api/v1/public/reports/status', {
      method: 'POST',
      body: { code: code.value.trim(), captchaToken: captchaToken.value },
    });
  } catch (failure: any) {
    error.value = failure?.data?.message || 'Status tidak dapat diperiksa. Coba kembali.';
  } finally {
    busy.value = false;
    captcha.value?.reset();
  }
}
</script>
<template>
  <section id="tracking" class="tracking-section" aria-labelledby="tracking-title">
    <div>
      <span class="tracking-eyebrow">CEK PERKEMBANGAN</span>
      <h2 id="tracking-title">Cek status laporan</h2>
      <p>
        Masukkan nomor tiket yang Anda simpan setelah mengirim laporan untuk melihat rincian,
        timeline penanganan, klarifikasi, dan jawaban resmi tanpa login.
      </p>
    </div>
    <form @submit.prevent="check">
      <label for="tracking-code">Nomor tiket</label
      ><input
        id="tracking-code"
        v-model="code"
        placeholder="WBS-…"
        maxlength="36"
        autocomplete="off"
        spellcheck="false"
        required
        :disabled="busy"
      /><small
        >Gunakan tiket rahasia WBS- berisi 32 karakter setelah tanda hubung. Jangan bagikan tiket
        Anda.</small
      ><RecaptchaWidget ref="captcha" v-model="captchaToken" /><button
        class="button"
        type="submit"
        :disabled="busy || !captchaToken || !code.trim()"
      >
        <LoaderCircle v-if="busy" class="spin" :size="17" /><Search v-else :size="17" />{{
          busy ? 'Memeriksa…' : 'Cek status'
        }}
      </button>
      <p v-if="error" class="tracking-error" role="alert">{{ error }}</p>
    </form>
    <div v-if="result" class="tracking-result" role="status">
      <header class="tracking-summary">
        <strong>{{ result.label }}</strong
        ><span v-if="result.lifecycle === 'SUSPENDED'">Penanganan sedang ditunda.</span
        ><span>Diperbarui {{ formatDateTime(result.updatedAt) }}</span>
      </header>
      <section class="tracking-description">
        <h3>Keterangan laporan</h3>
        <h4>{{ result.report.payload.title }}</h4>
        <p>Nomor laporan: {{ result.report.number }}</p>
        <dl>
          <template
            v-for="(label, key) in {
              category: 'Kategori',
              subcategory: 'Subkategori',
              when: 'Tanggal kejadian',
              where: 'Lokasi',
              what: 'Kejadian',
              who: 'Pihak terkait',
              why: 'Dasar laporan',
              how: 'Kronologi',
              evidenceReason: 'Sumber bukti',
            }"
            :key="key"
          >
            <dt>{{ label }}</dt>
            <dd>{{ result.report.payload[key] || '—' }}</dd>
          </template>
        </dl>
        <section v-if="result.report.clarification">
          <h3>Klarifikasi</h3>
          <p>{{ result.report.clarification.question }}</p>
          <p>{{ result.report.clarification.response || 'Menunggu jawaban pelapor.' }}</p>
        </section>
      </section>
      <ReportTimeline :report="result.report" />
      <section
        v-for="answer in result.officialResponses"
        :key="answer.createdAt"
        class="tracking-description"
      >
        <h3>Jawaban resmi</h3>
        <p>{{ answer.content }}</p>
        <small>{{ formatDateTime(answer.createdAt) }}</small>
      </section>
    </div>
  </section>
</template>
<style scoped>
.tracking-section {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 28px;
  padding: 45px 0 60px;
  border-top: 1px solid #cbd1c1;
  scroll-margin-top: 25px;
}
.tracking-eyebrow {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #89503e;
}
.tracking-section h2 {
  font-family: Georgia, serif;
  font-size: 36px;
  font-weight: 400;
  letter-spacing: -0.04em;
  margin: 15px 0;
}
.tracking-section p {
  font-size: 13px;
  line-height: 1.9;
  color: #626f58;
  max-width: none;
}
.tracking-section form {
  min-width: 0;
  padding: 25px;
  border: 1px solid #d8decd;
  background: #fff;
}
.tracking-section label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 10px;
}
.tracking-section input {
  width: 100%;
  font-family: monospace;
  font-size: 13px;
}
.tracking-section small {
  display: block;
  font-size: 11px;
  color: #7b846e;
  margin-top: 9px;
  line-height: 1.6;
}
.tracking-error {
  color: #9a3c35 !important;
  margin-top: 15px;
}
.tracking-result {
  min-width: 0;
  overflow-wrap: anywhere;
  display: grid;
  gap: 24px;
  width: 100%;
  margin-top: 4px;
  font-size: 14px;
}
.tracking-result strong {
  font-size: 17px;
}
.tracking-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px 28px;
  padding: 22px 28px;
  border-left: 4px solid var(--green);
  background: var(--academic-soft);
  border-radius: 8px;
}
.tracking-summary > span:last-child {
  margin-left: auto;
  color: var(--muted);
  font-size: 13px;
}
.tracking-description {
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 28px;
  min-width: 0;
}
.tracking-description h3 {
  margin: 0 0 20px;
  color: var(--green);
  font-size: 21px;
}
.tracking-description h4 {
  margin: 0 0 10px;
  font-size: 18px;
}
.tracking-description dl {
  display: grid;
  grid-template-columns: minmax(140px, 220px) minmax(0, 1fr);
  margin: 24px 0 0;
}
.tracking-description dt,
.tracking-description dd {
  margin: 0;
  padding: 16px 0;
  border-top: 1px solid var(--border);
  line-height: 1.8;
}
.tracking-description dt {
  color: var(--muted);
  padding-right: 20px;
  font-weight: 600;
}
.tracking-description dd,
.tracking-description p {
  white-space: pre-wrap;
}
.tracking-result :deep(.report-timeline) {
  width: 100%;
  padding: 28px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
}
@media (max-width: 700px) {
  .tracking-description,
  .tracking-summary,
  .tracking-result :deep(.report-timeline) {
    padding: 20px;
  }
  .tracking-description dl {
    grid-template-columns: minmax(0, 1fr);
  }
  .tracking-description dt {
    padding-bottom: 0;
  }
  .tracking-description dd {
    border-top: 0;
    padding-top: 6px;
  }
  .tracking-summary > span:last-child {
    margin-left: 0;
  }

  .tracking-section {
    grid-template-columns: minmax(0, 1fr);
    gap: 22px;
  }
  .tracking-section form {
    padding: 18px;
  }
}
</style>
