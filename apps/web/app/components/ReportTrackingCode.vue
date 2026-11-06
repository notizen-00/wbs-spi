<script setup lang="ts">
import { Copy, Check } from '@lucide/vue';
const props = defineProps<{ code: string }>();
const copied = ref(false),
  failed = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(props.code);
    copied.value = true;
    failed.value = false;
  } catch {
    failed.value = true;
  }
}
watch(
  () => props.code,
  () => {
    copied.value = false;
    failed.value = false;
  },
);
</script>
<template>
  <section class="tracking-code-box" aria-label="Kode pelacakan laporan">
    <div>
      <strong>Kode pelacakan</strong>
      <p>Simpan kode ini untuk mengecek status tanpa login. Jangan bagikan kepada pihak lain.</p>
      <code>{{ code }}</code>
    </div>
    <button type="button" class="button secondary" @click="copy">
      <Check v-if="copied" :size="16" /><Copy v-else :size="16" />{{
        copied ? 'Tersalin' : 'Salin kode'
      }}</button
    ><small v-if="failed" role="status">Pilih dan salin kode secara manual.</small
    ><small v-if="copied" role="status">Kode pelacakan berhasil disalin.</small>
  </section>
</template>
<style scoped>
.tracking-code-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  border: 1px solid #d4dfc9;
  padding: 18px;
  background: #f8faf4;
  margin-bottom: 25px;
  border-radius: 9px;
}
.tracking-code-box > div {
  min-width: 0;
}
.tracking-code-box strong {
  font-size: 13px;
}
.tracking-code-box p {
  font-size: 12px;
  color: #66745d;
  line-height: 1.7;
  margin: 8px 0;
}
.tracking-code-box code {
  font-size: 13px;
  overflow-wrap: anywhere;
  user-select: all;
  display: block;
}
.tracking-code-box small {
  width: 100%;
  color: #637553;
  font-size: 11px;
}
</style>
