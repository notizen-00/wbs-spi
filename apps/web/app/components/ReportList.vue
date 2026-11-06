<script setup lang="ts">
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  LoaderCircle,
  RotateCcw,
  SlidersHorizontal,
  AlertCircle,
} from '@lucide/vue';
import { stages, stageLabels, type Report, type User } from '@wbs/contracts';
import { formatDateTime } from '../utils/date-time';
const props = defineProps<{ user: User; categories: string[] }>();
defineEmits<{ open: [report: Report] }>();
const criteria = reactive({
  q: '',
  group: 'ALL',
  stage: '',
  lifecycle: '',
  category: '',
  sort: 'newest',
  pageSize: 10,
});
const page = ref(1),
  total = ref(0),
  totalPages = ref(1),
  items = ref<Report[]>([]),
  loading = ref(false),
  error = ref('');
const groups = computed(() => [
  { value: 'ALL', label: 'Semua' },
  { value: 'ACTIVE', label: 'Aktif' },
  ...(props.user.role === 'REPORTER' ? [{ value: 'DRAFT', label: 'Draf' }] : []),
  { value: 'FINISHED', label: 'Selesai / ditutup' },
]);
const availableStages = computed(() =>
  stages.filter(
    (stage) =>
      (props.user.role === 'REPORTER' || stage !== 'DRAFT') &&
      (criteria.group === 'ALL' ||
        (criteria.group === 'DRAFT'
          ? stage === 'DRAFT'
          : criteria.group === 'FINISHED'
            ? ['COMPLETED', 'CLOSED'].includes(stage)
            : !['DRAFT', 'COMPLETED', 'CLOSED'].includes(stage))),
  ),
);
const filtered = computed(() =>
  Boolean(
    criteria.q ||
    criteria.group !== 'ALL' ||
    criteria.stage ||
    criteria.lifecycle ||
    criteria.category ||
    criteria.sort !== 'newest',
  ),
);
const pageNumbers = computed(() =>
  Array.from(
    { length: Math.min(5, totalPages.value) },
    (_, index) => Math.max(1, Math.min(page.value - 2, totalPages.value - 4)) + index,
  ),
);
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | undefined;
let generation = 0;
async function load(current: number) {
  controller = new AbortController();
  try {
    const response = await $fetch<{
      items: Report[];
      total: number;
      totalPages: number;
      page: number;
    }>('/api/v1/reports', {
      query: { paginated: 'true', ...criteria, page: page.value },
      signal: controller.signal,
    });
    if (current !== generation) return;
    items.value = response.items;
    total.value = response.total;
    totalPages.value = response.totalPages;
    // The server clamps pages when the last result disappears.
    if (page.value !== response.page) page.value = response.page;
  } catch (failure: any) {
    if (current === generation) {
      items.value = [];
      error.value =
        failure?.data?.message || 'Daftar laporan tidak dapat dimuat. Silakan coba lagi.';
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}
function schedule() {
  clearTimeout(timer);
  controller?.abort();
  const current = ++generation;
  loading.value = true;
  error.value = '';
  timer = setTimeout(() => {
    void load(current);
  }, 250);
}
watch(
  criteria,
  () => {
    page.value = 1;
    schedule();
  },
  { deep: true },
);
watch(page, schedule);
watch(
  () => criteria.group,
  () => {
    criteria.stage = '';
    criteria.lifecycle = '';
  },
);
watch(
  () => props.user.id,
  () => {
    items.value = [];
    page.value = 1;
    schedule();
  },
  { immediate: true },
);
onUnmounted(() => {
  generation++;
  clearTimeout(timer);
  controller?.abort();
});
function reset() {
  Object.assign(criteria, {
    q: '',
    group: 'ALL',
    stage: '',
    lifecycle: '',
    category: '',
    sort: 'newest',
  });
}
</script>

<template>
  <section class="panel paginated-reports" aria-label="Daftar laporan">
    <div class="report-filters">
      <div class="filter-top">
        <div class="report-tabs" aria-label="Kelompok laporan">
          <button
            v-for="group in groups"
            :key="group.value"
            type="button"
            :aria-pressed="criteria.group === group.value"
            :class="{ selected: criteria.group === group.value }"
            @click="criteria.group = group.value"
          >
            {{ group.label }}
          </button>
        </div>
        <label class="report-search"
          ><Search :size="17" /><input
            v-model="criteria.q"
            type="search"
            maxlength="200"
            :placeholder="
              ['OFFICIAL', 'EXECUTOR'].includes(user.role)
                ? 'Cari nomor laporan…'
                : 'Cari judul atau nomor…'
            "
            aria-label="Cari laporan"
        /></label>
      </div>
      <div class="filter-grid">
        <label
          >Tahap penanganan<select v-model="criteria.stage">
            <option value="">Semua tahap</option>
            <option v-for="stage in availableStages" :key="stage" :value="stage">
              {{ stageLabels[stage] }}
            </option>
          </select></label
        >
        <label
          >Kondisi perkara<select v-model="criteria.lifecycle">
            <option value="">Semua kondisi</option>
            <option value="ACTIVE">Berjalan</option>
            <option value="SUSPENDED">Ditunda</option>
            <option value="COMPLETED">Selesai</option>
            <option value="CLOSED">Ditutup</option>
          </select></label
        >
        <label
          >Kategori<select v-model="criteria.category" aria-label="Kategori">
            <option value="">Semua kategori</option>
            <option v-for="category in categories" :key="category" :value="category">
              {{ category }}
            </option>
          </select></label
        >
        <label
          >Urutan pembaruan<select v-model="criteria.sort">
            <option value="newest">Terbaru dahulu</option>
            <option value="oldest">Terlama dahulu</option>
          </select></label
        >
      </div>
      <div class="filter-caption">
        <span
          ><SlidersHorizontal :size="14" />Filter berlaku pada seluruh laporan yang dapat Anda
          akses.</span
        ><button v-if="filtered" type="button" class="text-button" @click="reset">
          <RotateCcw :size="14" />Reset filter
        </button>
      </div>
    </div>
    <div v-if="loading" class="empty" role="status">
      <LoaderCircle class="spin" />
      <p>Memuat laporan…</p>
    </div>
    <div v-else-if="error" class="empty" role="alert">
      <AlertCircle />
      <p>{{ error }}</p>
      <button type="button" class="button secondary" @click="schedule">Coba lagi</button>
    </div>
    <div v-else-if="!items.length" class="empty">
      <FileText />
      <h4>
        {{ filtered ? 'Tidak ada laporan yang sesuai' : 'Belum ada laporan dalam akses Anda' }}
      </h4>
      <p>
        {{
          filtered
            ? 'Coba kata pencarian lain atau reset filter.'
            : 'Laporan akan muncul setelah dibuat atau diberikan akses.'
        }}
      </p>
    </div>
    <template v-else
      ><button
        v-for="report in items"
        :key="report.id"
        type="button"
        class="report-row"
        @click="$emit('open', report)"
      >
        <span class="report-icon"><FileText :size="20" /></span
        ><span class="report-copy"
          ><strong>{{ report.payload.title || 'Draf tanpa judul' }}</strong
          ><small
            >{{ report.number || 'Draf privat' }} · {{ formatDateTime(report.updatedAt) }}</small
          ></span
        ><span class="badge" :class="report.stage.toLowerCase()">{{
          stageLabels[report.stage]
        }}</span
        ><ChevronRight :size="17" /></button
    ></template>
    <footer class="report-pagination">
      <div class="pagination-info" aria-live="polite">
        <span v-if="!loading && !error"
          >{{ total ? (page - 1) * criteria.pageSize + 1 : 0 }}–{{
            Math.min(page * criteria.pageSize, total)
          }}
          dari {{ total }} laporan</span
        ><label
          >Per halaman<select v-model.number="criteria.pageSize">
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
          </select></label
        >
      </div>
      <nav aria-label="Pagination laporan">
        <button
          type="button"
          :disabled="loading || page <= 1 || !!error"
          aria-label="Halaman sebelumnya"
          @click="page--"
        >
          <ChevronLeft :size="17" /></button
        ><button
          v-for="number in pageNumbers"
          :key="number"
          type="button"
          :disabled="loading || !!error"
          :aria-label="`Halaman ${number}`"
          :aria-current="page === number ? 'page' : undefined"
          @click="page = number"
        >
          {{ number }}</button
        ><button
          type="button"
          :disabled="loading || page >= totalPages || !!error"
          aria-label="Halaman berikutnya"
          @click="page++"
        >
          <ChevronRight :size="17" />
        </button>
      </nav>
    </footer>
  </section>
</template>

<style scoped>
.report-filters {
  padding: 22px;
  border-bottom: 1px solid #e3e9dd;
}
.filter-top {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
}
.report-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.report-tabs button {
  border: 0;
  background: transparent;
  padding: 9px 12px;
  border-radius: 8px;
  color: #62715a;
  font-size: 12px;
  cursor: pointer;
}
.report-tabs button.selected {
  background: #eaf2e5;
  color: #2b6140;
  font-weight: 700;
}
.report-search {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 0 12px;
  border: 1px solid #dae2d3;
  border-radius: 9px;
  min-width: 0;
  color: #718366;
}
.report-search input {
  border: 0;
  box-shadow: none;
  min-width: 0;
  padding: 11px 0;
  font-size: 12px;
}
.filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 20px;
}
.filter-grid label,
.pagination-info label {
  display: grid;
  gap: 7px;
  min-width: 0;
  font-size: 11px;
  color: #53654b;
}
.filter-grid select {
  width: 100%;
  min-width: 0;
  font-size: 12px;
}
.filter-caption {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-top: 15px;
  font-size: 11px;
  color: #748269;
}
.filter-caption span,
.filter-caption button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.filter-caption svg {
  flex-shrink: 0;
}
.report-pagination {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-top: 1px solid #e3e9dd;
}
.pagination-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  color: #617056;
  font-size: 12px;
}
.pagination-info label {
  display: flex;
  align-items: center;
}
.pagination-info select {
  width: auto;
  padding: 7px 10px;
}
.report-pagination nav {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.report-pagination nav button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid #dce4d4;
  border-radius: 8px;
  background: #fff;
  color: #506546;
  cursor: pointer;
}
.report-pagination nav button[aria-current='page'] {
  background: #2e6242;
  color: white;
  border-color: #2e6242;
}
.report-pagination nav button:disabled {
  opacity: 0.45;
  cursor: default;
}
@media (max-width: 1100px) {
  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 480px) {
  .report-filters,
  .report-pagination {
    padding: 16px;
  }
  .report-search {
    width: 100%;
  }
  .filter-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
