<script setup lang="ts">
import {
  Plus,
  Pencil,
  Trash2,
  Settings,
  Tags,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from '@lucide/vue';
import { formatDateTime } from '../utils/date-time';
const props = defineProps<{ section: string }>();
const emit = defineEmits<{ navigate: [section: string] }>();
const { reloadSite } = useSiteConfiguration();
interface Category {
  id: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
  version: number;
}
interface SettingsData {
  appName: string;
  institutionName: string;
  tagline: string;
  helpEmail: string;
  helpPhone: string;
  helpAddress: string;
  logoDataUrl: string | null;
  version: number;
}
const categories = ref<Category[]>([]),
  audits = ref<{ action: string; createdAt: string; actor: { name: string } }[]>([]);
const settings = reactive<SettingsData>({
  appName: '',
  institutionName: '',
  tagline: '',
  helpEmail: '',
  helpPhone: '',
  helpAddress: '',
  logoDataUrl: null,
  version: 1,
});
const loading = ref(true),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  editing = ref(false),
  deletion = ref<Category | null>(null);
const form = reactive({
  id: '',
  name: '',
  description: '',
  active: true,
  sortOrder: 0,
  expectedVersion: 1,
});
const auditLabels: Record<string, string> = {
  CREATE_SUPER_ADMIN: 'Akun super admin dibuat',
  CREATE_CATEGORY: 'Bidang ditambahkan',
  UPDATE_CATEGORY: 'Bidang diperbarui',
  DELETE_CATEGORY: 'Bidang dihapus',
  UPDATE_SITE_SETTINGS: 'Pengaturan situs diperbarui',
};
async function load() {
  loading.value = true;
  try {
    const [rows, values, history] = await Promise.all([
      $fetch<Category[]>('/api/v1/admin/categories'),
      $fetch<SettingsData>('/api/v1/admin/settings'),
      $fetch<typeof audits.value>('/api/v1/admin/audits'),
    ]);
    categories.value = rows;
    Object.assign(settings, values);
    audits.value = history;
  } catch (failure: any) {
    error.value = failure?.data?.message || 'Pengaturan tidak dapat dimuat.';
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(
  () => props.section,
  () => {
    editing.value = false;
    deletion.value = null;
    error.value = '';
    notice.value = '';
  },
);
function edit(category?: Category) {
  Object.assign(
    form,
    category
      ? { ...category, expectedVersion: category.version }
      : {
          id: '',
          name: '',
          description: '',
          active: true,
          sortOrder: categories.value.length * 10 + 10,
          expectedVersion: 1,
        },
  );
  editing.value = true;
  deletion.value = null;
  error.value = '';
  notice.value = '';
}
async function mutate(operation: () => Promise<unknown>, message: string) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await operation();
    editing.value = false;
    deletion.value = null;
    await load();
    await reloadSite();
    notice.value = message;
  } catch (failure: any) {
    error.value = failure?.data?.message || 'Perubahan tidak dapat disimpan.';
  } finally {
    busy.value = false;
  }
}
function saveCategory() {
  return mutate(
    () =>
      $fetch<Category>('/api/v1/admin/categories' + (form.id ? '/' + form.id : ''), {
        method: form.id ? 'PATCH' : 'POST',
        body: form,
      }),
    'Bidang berhasil disimpan.',
  );
}
function deleteCategory() {
  const item = deletion.value;
  if (item)
    return mutate(
      () =>
        $fetch<{ ok: boolean }>('/api/v1/admin/categories/' + item.id, {
          method: 'DELETE',
          body: { expectedVersion: item.version },
        }),
      'Bidang berhasil dihapus.',
    );
}
function saveSettings() {
  return mutate(
    () =>
      $fetch<SettingsData>('/api/v1/admin/settings', {
        method: 'PATCH',
        body: { ...settings, expectedVersion: settings.version },
      }),
    'Pengaturan situs berhasil disimpan.',
  );
}
async function chooseLogo(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  error.value = '';
  if (file.size > 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    error.value = 'Pilih PNG, JPG, atau WebP, maksimal 1 MiB.';
    input.value = '';
    return;
  }
  try {
    settings.logoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  } catch {
    error.value = 'Logo tidak dapat dibaca.';
  }
  input.value = '';
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">ADMINISTRASI SITUS</div>
      <h1>
        {{
          section === 'categories'
            ? 'Bidang laporan'
            : section === 'settings'
              ? 'Pengaturan situs'
              : 'Dashboard super admin'
        }}
      </h1>
      <p>Kelola katalog dan identitas layanan tanpa membuka isi perkara.</p>
    </div>
    <button type="button" class="button secondary" :disabled="busy || loading" @click="load">
      <RefreshCw :size="16" />Muat ulang
    </button>
  </div>
  <div v-if="error" class="alert error" role="alert"><AlertCircle :size="18" />{{ error }}</div>
  <div v-if="notice" class="alert success" role="status">
    <CheckCircle2 :size="18" />{{ notice }}
  </div>
  <p v-if="loading" role="status">Memuat pengaturan…</p>
  <template v-else>
    <template v-if="section === 'overview'"
      ><div class="admin-overview">
        <button class="panel admin-summary" @click="emit('navigate', 'adminCategories')">
          <Tags :size="24" />
          <h2>Bidang laporan</h2>
          <strong
            >{{ categories.filter((c) => c.active).length }} aktif /
            {{ categories.length }} bidang</strong
          >
          <p>Tambah, ubah, nonaktifkan, atau hapus bidang yang belum digunakan.</p></button
        ><button class="panel admin-summary" @click="emit('navigate', 'adminSettings')">
          <Settings :size="24" />
          <h2>Identitas & pusat bantuan</h2>
          <strong>{{ settings.appName }} · {{ settings.institutionName }}</strong>
          <p>Atur logo, nama aplikasi, dan kontak bantuan yang tampil di website.</p>
        </button>
      </div>
      <section class="panel admin-history">
        <h2>Perubahan terakhir</h2>
        <p v-if="!audits.length">Belum ada perubahan pengaturan.</p>
        <article v-for="(audit, index) in audits" :key="index">
          <strong>{{ auditLabels[audit.action] || audit.action }}</strong
          ><span>{{ audit.actor.name }}</span
          ><time :datetime="audit.createdAt">{{ formatDateTime(audit.createdAt) }}</time>
        </article>
      </section></template
    >
    <section v-else-if="section === 'categories'" class="panel admin-section">
      <div class="admin-section-heading">
        <div>
          <h2>Daftar bidang</h2>
          <p>
            Bidang nonaktif tidak ditawarkan pada laporan baru. Riwayat laporan tetap tersimpan.
          </p>
        </div>
        <button class="button" :disabled="busy" @click="edit()">
          <Plus :size="16" />Tambah bidang
        </button>
      </div>
      <form v-if="editing" class="admin-category-form fields" @submit.prevent="saveCategory">
        <h3>{{ form.id ? 'Ubah bidang' : 'Bidang baru' }}</h3>
        <label>Nama bidang<input v-model="form.name" required maxlength="120" /></label
        ><label
          >Deskripsi<textarea
            v-model="form.description"
            rows="3"
            maxlength="1000"
          ></textarea></label
        ><label
          >Urutan tampil<input
            v-model.number="form.sortOrder"
            type="number"
            min="0"
            max="10000"
            required /></label
        ><label class="admin-checkbox"
          ><input v-model="form.active" type="checkbox" />Aktif untuk laporan baru</label
        >
        <div class="admin-actions">
          <button class="button" :disabled="busy"><Save :size="16" />Simpan bidang</button
          ><button type="button" class="button secondary" :disabled="busy" @click="editing = false">
            Batal
          </button>
        </div>
      </form>
      <div v-if="deletion" class="admin-confirm" role="alert">
        <p>
          Hapus bidang <strong>{{ deletion.name }}</strong
          >? Penghapusan ditolak jika bidang telah digunakan laporan.
        </p>
        <div class="admin-actions">
          <button class="button admin-danger" :disabled="busy" @click="deleteCategory">
            Ya, hapus bidang</button
          ><button class="button secondary" :disabled="busy" @click="deletion = null">Batal</button>
        </div>
      </div>
      <div v-if="!categories.length" class="empty">Belum ada bidang.</div>
      <article v-for="category in categories" :key="category.id" class="admin-category-row">
        <div>
          <h3>{{ category.name }}</h3>
          <p v-if="category.description">{{ category.description }}</p>
          <small
            >{{ category.active ? 'Aktif' : 'Nonaktif' }} · Urutan {{ category.sortOrder }}</small
          >
        </div>
        <div class="admin-actions">
          <button
            class="text-button"
            :disabled="busy"
            :aria-label="`Ubah bidang ${category.name}`"
            @click="edit(category)"
          >
            <Pencil :size="15" />Ubah</button
          ><button
            class="text-button admin-delete"
            :disabled="busy"
            :aria-label="`Hapus bidang ${category.name}`"
            @click="
              deletion = category;
              editing = false;
            "
          >
            <Trash2 :size="15" />Hapus
          </button>
        </div>
      </article>
    </section>
    <form
      v-else-if="section === 'settings'"
      class="panel admin-section fields"
      @submit.prevent="saveSettings"
    >
      <h2>Identitas layanan</h2>
      <div class="admin-settings-grid">
        <label>Nama aplikasi<input v-model="settings.appName" required maxlength="80" /></label
        ><label
          >Nama institusi<input v-model="settings.institutionName" required maxlength="120"
        /></label>
      </div>
      <label>Tagline<input v-model="settings.tagline" maxlength="240" /></label>
      <div class="admin-logo">
        <img
          v-if="settings.logoDataUrl"
          :src="settings.logoDataUrl"
          alt="Pratinjau logo situs"
        /><span v-else>Logo default</span>
        <div>
          <label
            >Unggah logo<input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              :disabled="busy"
              @change="chooseLogo" /></label
          ><small>PNG, JPG, atau WebP. Maksimal 1 MiB.</small
          ><button
            v-if="settings.logoDataUrl"
            type="button"
            class="text-button"
            @click="settings.logoDataUrl = null"
          >
            Hapus logo
          </button>
        </div>
      </div>
      <h2>Kontak pusat bantuan</h2>
      <div class="admin-settings-grid">
        <label
          >Email bantuan<input v-model="settings.helpEmail" type="email" maxlength="200" /></label
        ><label
          >Telepon bantuan<input v-model="settings.helpPhone" type="tel" maxlength="40"
        /></label>
      </div>
      <label
        >Alamat / keterangan layanan<textarea
          v-model="settings.helpAddress"
          rows="3"
          maxlength="500"
        ></textarea>
      </label>
      <p class="admin-hint">
        Kontak ini ditampilkan pada halaman publik. Kosongkan jika belum ditetapkan.
      </p>
      <div>
        <button class="button" :disabled="busy">
          <Save :size="16" />{{ busy ? 'Menyimpan…' : 'Simpan pengaturan' }}
        </button>
      </div>
    </form>
  </template>
</template>
<style scoped>
.admin-overview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}
.admin-summary {
  padding: 26px;
  text-align: left;
  color: #30462e;
  cursor: pointer;
}
.admin-summary h2 {
  font-size: 18px;
  margin: 17px 0;
}
.admin-summary strong {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.admin-summary p,
.admin-section p {
  font-size: 12px;
  line-height: 1.8;
  color: #6d7a60;
  margin-top: 10px;
}
.admin-section,
.admin-history {
  padding: 26px;
  margin-top: 20px;
}
.admin-section h2,
.admin-history h2 {
  font-size: 18px;
}
.admin-section-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  margin-bottom: 24px;
}
.admin-category-form {
  padding: 20px;
  margin-bottom: 25px;
  background: #f6f8f1;
  border: 1px solid #d9e3ce;
  border-radius: 10px;
}
.admin-category-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  border-top: 1px solid #e1e6d9;
  padding: 20px 0;
}
.admin-category-row > div:first-child {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}
.admin-category-row h3 {
  font-size: 14px;
}
.admin-category-row small,
.admin-logo small {
  display: block;
  margin-top: 9px;
  color: #75826a;
  font-size: 11px;
}
.admin-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 15px;
}
.admin-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.admin-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
}
.admin-checkbox input {
  width: auto;
}
.admin-confirm {
  background: #fff3e9;
  border: 1px solid #ead5be;
  padding: 20px;
  margin-bottom: 22px;
}
.admin-confirm p {
  margin: 0 0 15px;
}
.admin-danger {
  background: #8c3c31;
}
.admin-delete {
  color: #a04b3f;
}
.admin-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.admin-settings-grid label {
  min-width: 0;
}
.admin-settings-grid input {
  width: 100%;
}
.admin-logo {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  align-items: center;
  padding: 20px;
  background: #f7f9f3;
  border: 1px dashed #c8d4bc;
}
.admin-logo img {
  width: 85px;
  height: 85px;
  object-fit: contain;
}
.admin-logo input {
  max-width: 100%;
}
.admin-hint {
  margin: 0;
}
.admin-history article {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  padding: 16px 0;
  border-top: 1px solid #e0e6d7;
  margin-top: 15px;
  font-size: 12px;
}
.admin-history time {
  color: #748269;
}
@media (max-width: 650px) {
  .admin-overview,
  .admin-settings-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .admin-section,
  .admin-history {
    padding: 18px;
  }
  .admin-logo {
    padding: 15px;
  }
}
</style>
