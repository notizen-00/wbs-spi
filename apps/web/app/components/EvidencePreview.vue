<script setup lang="ts">
import { Download, X, LoaderCircle, AlertCircle, FileText } from '@lucide/vue';
const props = defineProps<{ file: { id: string; name: string; mime: string } }>();
const emit = defineEmits<{ close: [] }>();
const source = ref(''),
  loading = ref(false),
  error = ref('');
const mediaError = ref('');
let controller: AbortController | undefined;
let generation = 0;
function release() {
  controller?.abort();
  if (source.value) URL.revokeObjectURL(source.value);
  source.value = '';
}
watch(
  () => props.file.id,
  async () => {
    const current = ++generation;
    release();
    controller = new AbortController();
    loading.value = true;
    error.value = '';
    mediaError.value = '';
    try {
      // Reuse the authorized, audited download route. No public storage URL is exposed.
      const blob = await $fetch<Blob>(`/api/v1/evidence/${props.file.id}/download`, {
        responseType: 'blob',
        signal: controller.signal,
      });
      if (current !== generation) return;
      source.value = URL.createObjectURL(new Blob([blob], { type: props.file.mime }));
    } catch (failure: any) {
      if (current !== generation) return;
      let message =
        'Bukti tidak dapat dimuat. Periksa koneksi dan hak akses Anda, lalu buka kembali pratinjau.';
      if (failure?.data instanceof Blob) {
        try {
          message = JSON.parse(await failure.data.text()).message || message;
        } catch {}
      }
      if (current === generation) error.value = message;
    } finally {
      if (current === generation) loading.value = false;
    }
  },
  { immediate: true },
);
onUnmounted(() => {
  generation++;
  release();
});
const kind = computed(() =>
  props.file.mime === 'application/pdf'
    ? 'pdf'
    : props.file.mime.startsWith('image/')
      ? 'image'
      : props.file.mime.startsWith('video/')
        ? 'video'
        : props.file.mime.startsWith('audio/')
          ? 'audio'
          : 'other',
);
function unsupported() {
  mediaError.value =
    'Browser ini tidak dapat menampilkan format atau codec berkas tersebut. Unduh bukti untuk membukanya dengan aplikasi yang sesuai.';
}
</script>

<template>
  <section class="evidence-preview" aria-label="Pratinjau bukti" :aria-busy="loading">
    <header class="preview-heading">
      <div>
        <span>PRATINJAU BUKTI</span>
        <h4>{{ file.name }}</h4>
      </div>
      <button
        type="button"
        class="icon-button"
        aria-label="Tutup pratinjau bukti"
        @click="emit('close')"
      >
        <X :size="19" />
      </button>
    </header>
    <div v-if="loading" class="preview-state" role="status">
      <LoaderCircle :size="24" />
      <p>Memuat bukti…</p>
    </div>
    <div v-else-if="error" class="preview-state" role="alert">
      <AlertCircle :size="25" />
      <p>{{ error }}</p>
    </div>
    <template v-else-if="source">
      <iframe v-if="kind === 'pdf'" :src="source" :title="`PDF ${file.name}`" class="preview-pdf" />
      <div v-else-if="kind === 'image'" class="preview-image">
        <img v-show="!mediaError" :src="source" :alt="file.name" @error="unsupported" />
      </div>
      <video
        v-else-if="kind === 'video'"
        :key="source"
        :src="source"
        controls
        playsinline
        preload="none"
        :aria-label="`Video ${file.name}`"
        @error="unsupported"
      />
      <div v-else-if="kind === 'audio'" class="preview-audio">
        <FileText :size="30" />
        <p>Rekaman audio</p>
        <audio
          :key="source"
          :src="source"
          controls
          preload="none"
          :aria-label="`Audio ${file.name}`"
          @error="unsupported"
        />
      </div>
      <div v-else class="preview-state">
        <FileText :size="25" />
        <p>Pratinjau format ini belum tersedia. Unduh untuk membuka berkas.</p>
      </div>
    </template>
    <div v-if="mediaError" class="preview-state" role="alert">
      <AlertCircle :size="25" />
      <p>{{ mediaError }}</p>
    </div>
    <footer>
      <span>Hanya bukti yang lolos pemindaian dapat dibuka.</span
      ><a :href="`/api/v1/evidence/${file.id}/download`" class="text-button"
        ><Download :size="16" />Unduh bukti</a
      >
    </footer>
  </section>
</template>

<style scoped>
.evidence-preview {
  margin-top: 18px;
  border: 1px solid #cfddca;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  min-width: 0;
}
.preview-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  background: #f4f8f1;
  border-bottom: 1px solid #dfe7db;
}
.preview-heading > div {
  min-width: 0;
}
.preview-heading span {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: #57704f;
  font-weight: 700;
}
.preview-heading h4 {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  color: #2d432f;
}
.preview-heading button {
  flex-shrink: 0;
}
.preview-pdf {
  display: block;
  width: 100%;
  height: min(70vh, 720px);
  min-height: 350px;
  border: 0;
  background: #eef0eb;
}
.preview-image {
  padding: 16px;
  background: #edf0e9;
  text-align: center;
}
.preview-image img {
  display: block;
  max-width: 100%;
  max-height: 65vh;
  object-fit: contain;
  margin: auto;
}
video {
  display: block;
  width: 100%;
  max-height: 65vh;
  background: #17231c;
}
.preview-audio,
.preview-state {
  display: grid;
  justify-items: center;
  gap: 14px;
  text-align: center;
  padding: 32px 18px;
  color: #55694e;
}
.preview-state p,
.preview-audio p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
}
audio {
  width: 100%;
  max-width: 520px;
}
footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-top: 1px solid #e5ebdf;
}
footer span {
  font-size: 11px;
  color: #66775e;
}
footer a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
