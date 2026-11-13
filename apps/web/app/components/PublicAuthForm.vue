<script setup lang="ts">
import { ShieldCheck, LockKeyhole, ArrowRight, LoaderCircle } from '@lucide/vue';
const { site } = useSiteConfiguration();
const props = defineProps<{
  staffOnly?: boolean;
  mode: string;
  credentials: { name: string; email: string; password: string };
  busy: boolean;
  error: string;
  notice: string;
}>();
const emit = defineEmits<{ submit: [captchaToken: string]; mode: [mode: string]; recovery: [] }>();
const captchaToken = ref('');
const captcha = ref<{ reset: () => void } | null>(null);
watch(
  () => props.busy,
  (value, prior) => {
    if (prior && !value) captcha.value?.reset();
  },
);
watch(
  () => props.mode,
  () => captcha.value?.reset(),
);
</script>
<template>
  <section class="auth-modal public-auth-card" aria-labelledby="auth-title">
    <SiteBrand />
    <div class="eyebrow">{{ site.tagline }}</div>
    <h2 id="auth-title">
      {{
        staffOnly ? 'Login petugas' : mode === 'register' ? 'Buat akun pelapor' : 'Masuk ke akun'
      }}
    </h2>
    <p>
      {{
        staffOnly
          ? 'Untuk verifikator/pemeriksa, pejabat, pelaksana, dan super admin. Gunakan email dan kata sandi akun petugas.'
          : mode === 'register'
            ? 'Daftarkan email Anda untuk mulai menyampaikan laporan.'
            : 'Gunakan email dan kata sandi yang terdaftar.'
      }}
    </p>
    <div v-if="error" class="alert error" role="alert">{{ error }}</div>
    <div v-if="notice" class="alert success" role="status">{{ notice }}</div>
    <form class="fields" @submit.prevent="captchaToken && emit('submit', captchaToken)">
      <label v-if="mode === 'register'"
        >Nama lengkap<input v-model="credentials.name" autocomplete="name" required
      /></label>
      <label
        >Email<input
          v-model="credentials.email"
          type="email"
          autocomplete="email"
          placeholder="nama@email.com"
          required
      /></label>
      <label
        >Kata sandi<input
          v-model="credentials.password"
          type="password"
          :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
          :minlength="mode === 'register' ? 6 : 1"
          maxlength="128"
          :placeholder="mode === 'register' ? 'Minimal 6 karakter' : 'Masukkan kata sandi'"
          required
      /></label>
      <RecaptchaWidget ref="captcha" v-model="captchaToken" />
      <button class="button full" :disabled="busy || !captchaToken" type="submit">
        <LoaderCircle v-if="busy" class="spin" :size="18" />{{
          busy ? 'Memproses…' : mode === 'register' ? 'Buat akun' : 'Masuk ke akun'
        }}<ArrowRight :size="17" />
      </button>
    </form>
    <p v-if="mode !== 'register'" class="auth-switch">
      <button type="button" @click="$emit('recovery')">Lupa kata sandi / verifikasi ulang</button>
    </p>
    <p v-if="!staffOnly" class="auth-switch">
      {{ mode === 'register' ? 'Sudah punya akun?' : 'Belum punya akun?'
      }}<button type="button" @click="$emit('mode', mode === 'register' ? 'login' : 'register')">
        {{ mode === 'register' ? 'Masuk' : 'Daftar sekarang' }}
      </button>
    </p>
    <div class="auth-foot">
      <LockKeyhole :size="13" />Gunakan data sintetis pada versi pengembangan ini.
    </div>
  </section>
</template>
<style scoped>
.public-auth-card {
  width: 100%;
  max-height: none;
  overflow: visible;
  box-shadow: 0 14px 45px #203e2510;
}
.public-auth-card > p {
  color: #63725b;
}
.auth-switch button {
  margin-left: 5px;
}
</style>
