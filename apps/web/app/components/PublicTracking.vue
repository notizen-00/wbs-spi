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
      <div v-if="result" class="tracking-result" role="status">
        <strong>{{ result.label }}</strong
        ><span v-if="result.lifecycle === 'SUSPENDED'">Penanganan sedang ditunda.</span
        ><span>Diperbarui {{ formatDateTime(result.updatedAt) }}</span>
        <h3>{{ result.report.payload.title }}</h3>
        <p>Nomor laporan: {{ result.report.number }}</p>
        <dl>
          <template
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
        <ReportTimeline :report="result.report" />
        <section v-for="answer in result.officialResponses" :key="answer.createdAt">
          <h3>Jawaban resmi</h3>
          <p>{{ answer.content }}</p>
          <small>{{ formatDateTime(answer.createdAt) }}</small>
        </section>
      </div>
    </form>
  </section>
</template>
<style scoped>
.tracking-section {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 60px;
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
  max-width: 350px;
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
  white-space: pre-wrap;
  display: grid;
  gap: 9px;
  border-left: 3px solid #5b7d45;
  padding: 15px;
  background: #f3f6ed;
  margin-top: 20px;
  font-size: 12px;
}
.tracking-result strong {
  font-size: 17px;
}
@media (max-width: 700px) {
  .tracking-section {
    grid-template-columns: minmax(0, 1fr);
    gap: 22px;
  }
  .tracking-section form {
    padding: 18px;
  }
}
</style>
