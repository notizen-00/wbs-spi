<script setup lang="ts">
import { Copy, Check, AlertCircle } from '@lucide/vue';
const props = defineProps<{ code: string; submitted?: boolean }>();
const copied = ref(false),
  failed = ref(false);
async function copy() {
  copied.value = false;
  failed.value = false;
  const code = props.code.trim();
  if (!code) {
    failed.value = true;
    return;
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(code);
    copied.value = true;
  } catch {
    // HTTP LAN origins do not expose the Clipboard API. Copy through a temporary selection.
    const previousFocus = document.activeElement as HTMLElement | null;
    const selection = window.getSelection();
    const ranges = selection
      ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange())
      : [];
    const input = document.createElement('textarea');
    input.value = code;
    input.readOnly = true;
    input.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
    try {
      input.select();
      input.setSelectionRange(0, code.length);
      copied.value = document.execCommand('copy');
      failed.value = !copied.value;
    } catch {
      failed.value = true;
    } finally {
      input.remove();
      previousFocus?.focus({ preventScroll: true });
      if (selection) {
        selection.removeAllRanges();
        ranges.forEach((range) => selection.addRange(range));
      }
    }
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
  <section class="tracking-code-box" aria-label="Nomor tiket laporan" tabindex="-1">
    <div v-if="submitted" class="ticket-warning" role="alert">
      <AlertCircle :size="22" aria-hidden="true" />
      <div>
        <strong>Mohon simpan tiket ini baik-baik.</strong>
        <p>
          Laporan berhasil dikirim. Salin dan simpan kode tiket Anda sekarang untuk memantau
          laporan. Jangan bagikan tiket kepada pihak lain.
        </p>
      </div>
    </div>
    <div>
      <strong>Nomor tiket</strong>
      <p>
        Simpan nomor tiket ini untuk mengecek status tanpa login. Jangan bagikan kepada pihak lain.
      </p>
      <code>{{ code }}</code>
    </div>
    <button type="button" class="button secondary" @click="copy">
      <Check v-if="copied" :size="16" /><Copy v-else :size="16" />{{
        copied ? 'Tersalin' : 'Salin tiket'
      }}</button
    ><small v-if="failed" role="status">Pilih dan salin kode secara manual.</small
    ><small v-if="copied" role="status">Nomor tiket berhasil disalin.</small>
  </section>
</template>
<style scoped>
.tracking-code-box {
  scroll-margin-top: 24px;
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
.tracking-code-box .ticket-warning {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 18px;
  background: #fff0f0;
  border: 1px solid #dfa5aa;
  border-left: 4px solid #b42332;
  border-radius: 7px;
  color: #8f1826;
}
.ticket-warning > svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.tracking-code-box .ticket-warning strong {
  color: #8f1826;
  font-size: 15px;
}
.tracking-code-box .ticket-warning p {
  color: #8f1826;
  margin-bottom: 0;
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
