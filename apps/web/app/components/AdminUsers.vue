<script setup lang="ts">
import { Users, UserPlus, RefreshCw, Eye, EyeOff, Pencil, Trash2 } from '@lucide/vue';
interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  verified: boolean;
  authVersion: number;
}
const roles: Record<string, string> = {
  INVESTIGATOR: 'Verifikator / Pemeriksa',
  OFFICIAL: 'Pejabat',
  EXECUTOR: 'Pelaksana',
  SUPER_ADMIN: 'Super Admin',
};
const users = ref<StaffUser[]>([]);
const loading = ref(false),
  saving = ref(false),
  showPassword = ref(false),
  error = ref(''),
  notice = ref('');
const editing = ref<StaffUser | null>(null),
  deletion = ref<StaffUser | null>(null);
const form = reactive({ name: '', email: '', password: '', role: 'INVESTIGATOR', active: true });
function resetForm() {
  editing.value = null;
  Object.assign(form, { name: '', email: '', password: '', role: 'INVESTIGATOR', active: true });
  showPassword.value = false;
}
function edit(user: StaffUser) {
  editing.value = user;
  deletion.value = null;
  Object.assign(form, {
    name: user.name,
    email: user.email,
    password: '',
    role: user.role,
    active: user.active,
  });
  error.value = '';
  notice.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function remove() {
  if (!deletion.value || saving.value) return;
  saving.value = true;
  error.value = '';
  notice.value = '';
  const target = deletion.value;
  try {
    await $fetch(`/api/v1/admin/users/${target.id}`, {
      method: 'DELETE',
      body: { expectedVersion: target.authVersion },
      timeout: 15000,
      retry: 0,
    });
    users.value = users.value.filter((user) => user.id !== target.id);
    if (editing.value?.id === target.id) resetForm();
    deletion.value = null;
    notice.value = `Pengguna ${target.name} berhasil dihapus.`;
  } catch (failure: any) {
    error.value = failure?.data?.message || 'Pengguna tidak dapat dihapus.';
  } finally {
    saving.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    users.value = await $fetch<StaffUser[]>('/api/v1/admin/users', { timeout: 10000, retry: 0 });
  } catch (failure: any) {
    error.value = failure?.data?.message || 'Daftar pengguna tidak dapat dimuat.';
  } finally {
    loading.value = false;
  }
}
async function create() {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const target = editing.value;
    const result = await $fetch<StaffUser>(
      '/api/v1/admin/users' + (target ? `/${target.id}` : ''),
      {
        method: target ? 'PATCH' : 'POST',
        body: { ...form, ...(target ? { expectedVersion: target.authVersion } : {}) },
        timeout: 15000,
        retry: 0,
      },
    );
    users.value = [...users.value.filter((user) => user.id !== result.id), result].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    resetForm();
    showPassword.value = false;
    notice.value = target
      ? `Pengguna ${result.name} berhasil diperbarui. Sesi lama pengguna telah dicabut.`
      : `Akun ${result.name} berhasil dibuat sebagai ${roles[result.role]}. Pengguna dapat login dengan email dan kata sandi yang ditetapkan.`;
  } catch (failure: any) {
    error.value = failure?.data?.message || 'Pengguna tidak dapat dibuat.';
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">ADMINISTRASI PENGGUNA</div>
      <h1>Pengguna &amp; peran</h1>
      <p>Tambah, lihat, ubah peran, nonaktifkan, atau hapus akun petugas.</p>
    </div>
    <button
      class="button secondary neutral"
      :disabled="loading || saving"
      @click="
        error = '';
        load();
      "
    >
      <RefreshCw :size="16" />Muat ulang
    </button>
  </div>
  <div v-if="error" class="alert error" role="alert">{{ error }}</div>
  <div v-if="notice" class="alert success" role="status">{{ notice }}</div>
  <div class="users-layout">
    <section class="panel user-create">
      <h2><UserPlus :size="21" />{{ editing ? 'Ubah pengguna' : 'Buat pengguna' }}</h2>
      <form class="fields" @submit.prevent="create">
        <label
          >Nama lengkap<input
            v-model="form.name"
            required
            maxlength="120"
            autocomplete="off"
            :disabled="saving"
        /></label>
        <label
          >Email pengguna<input
            v-model="form.email"
            type="email"
            required
            maxlength="200"
            autocomplete="off"
            :disabled="saving"
        /></label>
        <label
          >Peran<select v-model="form.role" aria-label="Peran" :disabled="saving">
            <option v-for="(label, role) in roles" :key="role" :value="role">{{ label }}</option>
          </select></label
        >
        <label
          >{{ editing ? 'Kata sandi baru (opsional)' : 'Kata sandi awal' }}
          <div class="password-field">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              :required="!editing"
              minlength="6"
              maxlength="128"
              autocomplete="new-password"
              :disabled="saving"
            /><button
              type="button"
              class="icon-button"
              :aria-label="showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="18" /><Eye v-else :size="18" />
            </button>
          </div>
          <small
            >Gunakan 6–128 karakter. Sampaikan kata sandi kepada pemilik akun secara pribadi.</small
          ></label
        >
        <label v-if="editing" class="user-active"
          ><input v-model="form.active" type="checkbox" :disabled="saving" /> Akun aktif</label
        >
        <p class="role-note">
          Akun langsung aktif dan dapat login. Verifikator/pemeriksa otomatis masuk tim penerima
          aduan. Akses perkara untuk pejabat dan pelaksana mengikuti mandat serta penugasan.
        </p>
        <button type="submit" class="button" :disabled="saving">
          <UserPlus :size="17" />{{
            saving ? 'Menyimpan...' : editing ? 'Simpan perubahan' : 'Buat pengguna'
          }}
        </button>
        <button
          v-if="editing"
          type="button"
          class="button secondary neutral"
          :disabled="saving"
          @click="resetForm"
        >
          Batal ubah
        </button>
      </form>
    </section>
    <section class="panel user-directory">
      <h2>
        <Users :size="21" />Daftar petugas <small>{{ users.length }}</small>
      </h2>
      <p v-if="loading" role="status">Memuat pengguna…</p>
      <p v-else-if="!users.length">Belum ada pengguna petugas.</p>
      <section v-if="deletion" class="delete-confirmation" aria-label="Konfirmasi hapus pengguna">
        <h3>Hapus pengguna {{ deletion.name }}?</h3>
        <p>
          Akun yang terkait riwayat laporan atau audit dapat dinonaktifkan melalui Ubah pengguna.
        </p>
        <div class="staff-actions">
          <button type="button" class="button danger" :disabled="saving" @click="remove">
            Ya, hapus pengguna</button
          ><button
            type="button"
            class="button secondary neutral"
            :disabled="saving"
            @click="deletion = null"
          >
            Batal hapus
          </button>
        </div>
      </section>
      <article v-for="user in users" :key="user.id" class="staff-row">
        <div>
          <strong>{{ user.name }}</strong>
          <p>{{ user.email }}</p>
        </div>
        <div>
          <span class="staff-role">{{ roles[user.role] }}</span
          ><small>{{ user.active ? 'Aktif' : 'Nonaktif' }}</small>
          <div class="staff-actions">
            <button
              type="button"
              class="text-button"
              :aria-label="`Ubah pengguna ${user.name}`"
              :disabled="saving"
              @click="edit(user)"
            >
              <Pencil :size="15" />Ubah</button
            ><button
              type="button"
              class="text-button danger"
              :aria-label="`Hapus pengguna ${user.name}`"
              :disabled="saving"
              @click="
                deletion = user;
                error = '';
                notice = '';
              "
            >
              <Trash2 :size="15" />Hapus
            </button>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>
<style scoped>
.staff-actions {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 12px;
  justify-content: flex-end;
}
.delete-confirmation {
  padding: 18px;
  margin-bottom: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--academic-soft);
  font-size: 13px;
  line-height: 1.7;
}
.user-active {
  display: flex !important;
  align-items: center;
  gap: 10px;
}
.user-active input {
  width: auto;
  margin: 0 !important;
}
.users-layout {
  display: grid;
  grid-template-columns: minmax(300px, 0.85fr) minmax(0, 1.3fr);
  gap: 24px;
  align-items: start;
}
.user-create,
.user-directory {
  padding: 28px;
  min-width: 0;
}
h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 24px;
  font-size: 20px;
}
h2 small {
  margin-left: auto;
  color: var(--muted);
}
.password-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.password-field input {
  min-width: 0;
  flex: 1;
}
label small {
  display: block;
  margin-top: 8px;
  line-height: 1.6;
  color: var(--muted);
}
.role-note {
  margin: 0;
  padding: 14px;
  background: var(--academic-soft);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
  border-radius: 6px;
}
.staff-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 0;
  border-top: 1px solid var(--border);
  overflow-wrap: anywhere;
}
.staff-row p {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.staff-row > div:last-child {
  text-align: right;
}
.staff-row small {
  display: block;
  margin-top: 7px;
  color: var(--muted);
  font-size: 11px;
}
.staff-role {
  color: var(--green);
  font-size: 12px;
}
@media (max-width: 1050px) {
  .users-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 500px) {
  .user-create,
  .user-directory {
    padding: 20px;
  }
  .staff-row {
    flex-direction: column;
    gap: 10px;
  }
  .staff-row > div:last-child {
    text-align: left;
  }
}
</style>
