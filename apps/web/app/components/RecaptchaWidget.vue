<script setup lang="ts">
import { loadRecaptcha, type RecaptchaApi } from '../utils/recaptcha';
defineProps<{ modelValue?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const container = ref<HTMLElement | null>(null),
  required = ref(true),
  error = ref(''),
  loading = ref(true);
let api: RecaptchaApi | undefined,
  widget: number | undefined,
  disposed = false;
function reset() {
  if (widget !== undefined) api?.reset(widget);
  emit('update:modelValue', required.value ? '' : 'development');
}
defineExpose({ reset });
async function initialize() {
  loading.value = true;
  error.value = '';
  try {
    const config = await $fetch<{ siteKey: string; configured: boolean; required?: boolean }>(
      '/api/v1/public/captcha',
    );
    if (disposed) return;
    if (config.required === false) {
      required.value = false;
      emit('update:modelValue', 'development');
      return;
    }
    if (!config.configured || !config.siteKey)
      throw new Error('Verifikasi keamanan belum tersedia. Hubungi pengelola.');
    api = await loadRecaptcha();
    if (disposed || !container.value) return;
    widget = api.render(container.value, {
      sitekey: config.siteKey,
      size: window.innerWidth < 420 ? 'compact' : 'normal',
      callback: (value: string) => {
        if (!disposed) {
          error.value = '';
          emit('update:modelValue', value);
        }
      },
      'expired-callback': () => {
        if (!disposed) {
          emit('update:modelValue', '');
          error.value = 'Verifikasi kedaluwarsa. Silakan centang reCAPTCHA kembali.';
        }
      },
      'error-callback': () => {
        if (!disposed) {
          emit('update:modelValue', '');
          error.value = 'Verifikasi gagal dimuat. Periksa koneksi dan coba lagi.';
        }
      },
    });
  } catch (failure) {
    if (!disposed)
      error.value =
        failure instanceof Error ? failure.message : 'Verifikasi keamanan tidak dapat dimuat.';
  } finally {
    if (!disposed) loading.value = false;
  }
}
onMounted(initialize);
onUnmounted(() => {
  disposed = true;
  if (widget !== undefined) api?.reset(widget);
});
</script>
<template>
  <div v-show="required" class="captcha-field">
    <span class="captcha-label">Verifikasi keamanan</span>
    <div ref="container"></div>
    <p v-if="loading" role="status">Memuat reCAPTCHA…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button
      v-if="error"
      type="button"
      class="text-button"
      @click="widget !== undefined ? reset() : initialize()"
    >
      Coba lagi
    </button>
  </div>
</template>
<style scoped>
.captcha-field {
  margin: 16px 0;
  min-width: 0;
}
.captcha-label {
  display: block;
  margin-bottom: 9px;
  font-size: 12px;
  font-weight: 600;
  color: #42563b;
}
.captcha-field p {
  font-size: 12px;
  line-height: 1.7;
  color: #805034;
  margin-top: 8px;
}
.captcha-field button {
  margin-top: 7px;
}
</style>
