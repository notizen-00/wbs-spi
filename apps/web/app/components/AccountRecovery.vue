<script setup lang="ts">
import { X, LockKeyhole, ArrowRight } from '@lucide/vue';
const props = defineProps<{ token?: string }>();
const emit = defineEmits<{ close: []; done: [message: string] }>();
const email = ref(''),
  password = ref(''),
  error = ref(''),
  busy = ref(false),
  kind = ref('RESET');
async function submit() {
  busy.value = true;
  error.value = '';
  try {
    const response = await $fetch<any>(
      props.token ? '/api/v1/auth/reset-password' : '/api/v1/auth/recovery',
      {
        method: 'POST',
        body: props.token
          ? { token: props.token, password: password.value }
          : { email: email.value, kind: kind.value },
      },
    );
    emit('done', response.message);
  } catch (e: any) {
    error.value = e?.data?.message || 'Layanan sementara tidak tersedia.';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <section role="dialog" aria-modal="true" aria-labelledby="recovery-title" class="auth-modal">
      <button
        class="icon-button modal-close"
        aria-label="Tutup pemulihan akun"
        @click="emit('close')"
      >
        <X /></button
      ><span class="brand-icon"><LockKeyhole :size="26" /></span>
      <h2 id="recovery-title">{{ token ? 'Atur kata sandi baru.' : 'Pulihkan akses Anda.' }}</h2>
      <p>
        {{
          token
            ? 'Gunakan kata sandi baru minimal 12 karakter.'
            : 'Kami akan mengirim tautan ke email akun Anda.'
        }}
      </p>
      <div v-if="error" class="alert error" role="alert">{{ error }}</div>
      <form class="fields" @submit.prevent="submit">
        <label v-if="token"
          >Kata sandi baru<input
            v-model="password"
            type="password"
            autocomplete="new-password"
            minlength="12"
            maxlength="128"
            required
            autofocus /></label
        ><template v-else
          ><label
            >Email akun<input
              v-model="email"
              type="email"
              autocomplete="email"
              required
              autofocus /></label
          ><label
            >Keperluan<select v-model="kind">
              <option value="RESET">Atur ulang kata sandi</option>
              <option value="VERIFY">Kirim ulang verifikasi email</option>
            </select></label
          ></template
        ><button class="button full" :disabled="busy">
          {{ busy ? 'Memproses…' : token ? 'Simpan kata sandi' : 'Kirim tautan'
          }}<ArrowRight :size="17" />
        </button>
      </form>
    </section>
  </div>
</template>
