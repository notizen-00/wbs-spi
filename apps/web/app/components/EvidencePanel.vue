<script setup lang="ts">
import { Upload, FileText, Download, RefreshCw, LockKeyhole } from '@lucide/vue';
import {
  EVIDENCE_MAX_BYTES,
  evidenceAccept,
  evidenceExtensions,
  evidenceFormatLabel,
} from '@wbs/contracts';
const props = defineProps<{ reportId: string; readonly?: boolean }>();
const emit = defineEmits<{ updated: [] }>();
const files = ref<any[]>([]),
  busy = ref(false),
  error = ref('');
const labels: Record<string, string> = {
  PENDING: 'Menunggu pemindaian',
  READY: 'Lolos pemindaian',
  REJECTED: 'Ditolak',
  ERROR: 'Terkunci — scan gagal',
};
async function refresh() {
  try {
    files.value = await $fetch<any[]>(`/api/v1/reports/${props.reportId}/evidence`);
    error.value = '';
    emit('updated');
  } catch (e: any) {
    error.value = e?.data?.message || 'Gagal memuat bukti.';
  }
}
watch(() => props.reportId, refresh, { immediate: true });
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || busy.value) return;
  if (!evidenceExtensions.includes(file.name.split('.').pop()?.toLowerCase() || '')) {
    error.value = 'Format tidak didukung. Pilih PDF, gambar, MP3, atau video yang tercantum.';
    input.value = '';
    return;
  }
  if (file.size > EVIDENCE_MAX_BYTES) {
    error.value = 'Maksimal 20 MiB per berkas.';
    input.value = '';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]!);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await $fetch(`/api/v1/reports/${props.reportId}/evidence`, {
      method: 'POST',
      body: { name: file.name, data },
    });
    await refresh();
  } catch (e: any) {
    error.value =
      e?.data?.message || 'Unggahan gagal. Periksa layanan penyimpanan dan coba kembali.';
  } finally {
    busy.value = false;
    input.value = '';
  }
}
</script>
<template>
  <section class="evidence-panel">
    <div class="evidence-heading">
      <h3><LockKeyhole :size="17" />Bukti pendukung</h3>
      <button
        type="button"
        class="icon-button"
        aria-label="Perbarui status pemindaian"
        @click="refresh"
      >
        <RefreshCw :size="16" />
      </button>
    </div>
    <p v-if="error" class="alert error" role="alert">{{ error }}</p>
    <label v-if="!readonly" class="upload-box"
      ><Upload :size="23" /><strong>{{ busy ? 'Mengunggah…' : 'Pilih berkas bukti' }}</strong
      ><span>{{ evidenceFormatLabel }} · 20 MiB per berkas · maksimal 10 berkas</span
      ><input type="file" :accept="evidenceAccept" :disabled="busy" @change="upload"
    /></label>
    <div v-for="f in files" :key="f.id" class="evidence-file">
      <FileText :size="19" />
      <div>
        <strong>{{ f.name }}</strong
        ><small>{{ (f.bytes / 1024).toFixed(0) }} KB · {{ labels[f.status] }}</small>
      </div>
      <a
        v-if="f.status === 'READY'"
        :href="`/api/v1/evidence/${f.id}/download`"
        class="icon-button"
        aria-label="Unduh bukti"
        ><Download :size="17" /></a
      ><LockKeyhole v-else :size="15" />
    </div>
    <p class="evidence-note">
      Berkas dikarantina dan tidak dapat diunduh sebelum lolos pemindaian. Pilih perbarui untuk
      melihat status terbaru.
    </p>
  </section>
</template>
