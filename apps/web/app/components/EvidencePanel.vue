<script setup lang="ts">
import { Upload, FileText, Download, RefreshCw, LockKeyhole, X } from '@lucide/vue';
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
const snackbar = ref('');
let snackbarTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const reported = new Map<string, string>();
function notify(message: string) {
  snackbar.value = message;
  clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => {
    snackbar.value = '';
  }, 12000);
}
async function refresh() {
  try {
    const reportId = props.reportId;
    const result = await $fetch<any[]>(`/api/v1/reports/${reportId}/evidence`);
    if (disposed || reportId !== props.reportId) return;
    files.value = result;
    const failures: string[] = [];
    for (const file of result) {
      if (['ERROR', 'REJECTED'].includes(file.status)) {
        const reason =
          file.scan_error ||
          'Pemindaian gagal. Hubungi pengelola untuk memeriksa layanan antivirus.';
        const signature = `${file.status}:${reason}`;
        if (reported.get(file.id) !== signature) {
          failures.push(`${file.name}: ${reason}`);
          reported.set(file.id, signature);
        }
      } else reported.delete(file.id);
    }
    if (failures.length) notify(failures.join(' '));
    error.value = '';
    emit('updated');
  } catch (e: any) {
    error.value = e?.data?.message || 'Gagal memuat bukti.';
    notify(error.value);
  } finally {
    clearTimeout(pollTimer);
    if (!disposed && files.value.some((f) => f.status === 'PENDING' || f.retry_scheduled))
      pollTimer = setTimeout(refresh, 5000);
  }
}
watch(
  () => props.reportId,
  () => {
    clearTimeout(pollTimer);
    reported.clear();
    files.value = [];
    snackbar.value = '';
    void refresh();
  },
  { immediate: true },
);
onUnmounted(() => {
  disposed = true;
  clearTimeout(pollTimer);
  clearTimeout(snackbarTimer);
});
async function retry(file: any) {
  if (busy.value) return;
  busy.value = true;
  try {
    await $fetch(`/api/v1/evidence/${file.id}/retry`, { method: 'POST' });
    await refresh();
    notify(`Pemindaian ${file.name} dijadwalkan ulang.`);
  } catch (e: any) {
    notify(e?.data?.message || 'Gagal menjadwalkan ulang pemindaian.');
  } finally {
    busy.value = false;
  }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || busy.value) return;
  if (!evidenceExtensions.includes(file.name.split('.').pop()?.toLowerCase() || '')) {
    error.value = 'Format tidak didukung. Pilih PDF, gambar, MP3, atau video yang tercantum.';
    notify(error.value);
    input.value = '';
    return;
  }
  if (file.size > EVIDENCE_MAX_BYTES) {
    error.value = 'Maksimal 20 MiB per berkas.';
    notify(error.value);
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
    notify(error.value);
  } finally {
    busy.value = false;
    input.value = '';
  }
}
</script>
<template>
  <section class="evidence-panel">
    <Teleport to="body"
      ><div v-if="snackbar" class="scan-snackbar" role="alert">
        <span>{{ snackbar }}</span
        ><button type="button" aria-label="Tutup pemberitahuan pemindaian" @click="snackbar = ''">
          <X :size="18" />
        </button></div
    ></Teleport>
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
        <small v-if="f.scan_error" class="scan-error-reason">{{ f.scan_error }}</small>
      </div>
      <button
        v-if="f.status === 'ERROR' && !readonly"
        type="button"
        class="text-button"
        :disabled="busy"
        :aria-label="`Ulangi pemindaian ${f.name}`"
        @click="retry(f)"
      >
        <RefreshCw :size="16" />Coba ulang
      </button>
      <a
        v-if="f.status === 'READY'"
        :href="`/api/v1/evidence/${f.id}/download`"
        class="icon-button"
        aria-label="Unduh bukti"
        ><Download :size="17" /></a
      ><LockKeyhole v-else :size="15" />
    </div>
    <p class="evidence-note">
      Berkas dikarantina sampai lolos pemindaian. Status diperbarui otomatis. Jika gagal, periksa
      alasannya dan coba ulang setelah layanan diperbaiki.
    </p>
  </section>
</template>

<style scoped>
.scan-snackbar {
  position: fixed;
  z-index: 1000;
  bottom: max(20px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  width: min(560px, calc(100vw - 32px));
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: #233a35;
  color: white;
  box-shadow: 0 8px 32px #0003;
  font-size: 14px;
  overflow-wrap: anywhere;
  max-height: 40vh;
  overflow-y: auto;
}
.scan-snackbar span {
  flex: 1;
  min-width: 0;
}
.scan-snackbar button {
  border: 0;
  background: transparent;
  color: white;
  cursor: pointer;
  padding: 4px;
}
.scan-error-reason {
  color: #a33434;
  overflow-wrap: anywhere;
}
.evidence-file {
  flex-wrap: wrap;
}
.evidence-file > div {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}
</style>
