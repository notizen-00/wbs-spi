<script setup lang="ts">
import { ChartPie, TrendingUp, ChartColumnIncreasing } from '@lucide/vue';
const props = defineProps<{
  statistics: {
    total: number;
    active: number;
    completed: number;
    closed: number;
    categories: { name: string; count: number }[];
    monthly: { month: string; count: number }[];
  };
}>();
const colors = ['#285943', '#6c9148', '#c29b47', '#598eaa', '#a56c63', '#89829f'];
const selected = ref<number | null>(null);
const categories = computed(() => {
  const rows = props.statistics.categories;
  return rows.length <= 6
    ? rows
    : [
        ...rows.slice(0, 5),
        { name: 'Kategori lainnya', count: rows.slice(5).reduce((sum, row) => sum + row.count, 0) },
      ];
});
const slices = computed(() => {
  let offset = 0;
  return categories.value.map((row, index) => {
    const percent = props.statistics.total ? (row.count / props.statistics.total) * 100 : 0;
    const slice = { ...row, percent, offset, color: colors[index] };
    offset += percent;
    return slice;
  });
});
const highlighted = computed(() =>
  selected.value === null ? undefined : slices.value[selected.value],
);
watch(
  () => props.statistics,
  () => {
    selected.value = null;
  },
);
const format = (count: number) => new Intl.NumberFormat('id-ID').format(count);
const percent = (count: number) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(
    props.statistics.total ? (count / props.statistics.total) * 100 : 0,
  );
const statuses = computed(() => [
  { name: 'Dalam proses', count: props.statistics.active, color: '#598eaa' },
  { name: 'Selesai', count: props.statistics.completed, color: '#285943' },
  { name: 'Ditutup', count: props.statistics.closed, color: '#c29b47' },
]);
const months = computed(() => props.statistics.monthly ?? []);
const maximum = computed(
  () => Math.ceil(Math.max(1, ...months.value.map((row) => row.count)) / 3) * 3,
);
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00+07:00`).toLocaleDateString('id-ID', {
    month: 'short',
    year: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
const points = computed(() =>
  months.value.map((row, index) => ({
    ...row,
    x: 55 + index * 110,
    y: 190 - (row.count / maximum.value) * 150,
  })),
);
const line = computed(() => points.value.map((row) => `${row.x},${row.y}`).join(' '));
const area = computed(() =>
  points.value.length
    ? `M ${points.value[0]!.x},190 L ${points.value.map((row) => `${row.x},${row.y}`).join(' L ')} L ${points.value[points.value.length - 1]!.x},190 Z`
    : '',
);
</script>

<template>
  <div class="visual-charts">
    <section class="visual-card category-donut" aria-labelledby="donut-title">
      <div class="chart-heading">
        <ChartPie :size="20" aria-hidden="true" />
        <h3 id="donut-title">Komposisi kategori</h3>
      </div>
      <p>Proporsi seluruh laporan terkirim. Pilih kategori untuk melihat rinciannya.</p>
      <div class="donut-layout">
        <div class="donut-container">
          <svg
            viewBox="0 0 220 220"
            class="donut"
            role="img"
            aria-label="Diagram donat proporsi laporan per kategori; rincian tersedia pada legenda"
          >
            <circle cx="110" cy="110" r="82" fill="none" stroke="#e9eee3" stroke-width="30" />
            <circle
              v-for="(slice, index) in slices"
              :key="slice.name"
              cx="110"
              cy="110"
              r="82"
              fill="none"
              :stroke="slice.color"
              stroke-width="30"
              pathLength="100"
              :stroke-dasharray="`${slice.percent} ${100 - slice.percent}`"
              :stroke-dashoffset="-slice.offset"
              transform="rotate(-90 110 110)"
              :opacity="selected === null || selected === index ? 1 : 0.25"
            >
              <title>
                {{ slice.name }}: {{ slice.count }} laporan ({{ percent(slice.count) }}%)
              </title>
            </circle>
          </svg>
          <div class="donut-center" aria-live="polite">
            <strong>{{ format(highlighted?.count ?? statistics.total) }}</strong
            ><span>{{ highlighted ? percent(highlighted.count) + '%' : 'Total laporan' }}</span>
          </div>
        </div>
        <ul class="chart-legend">
          <li v-for="(slice, index) in slices" :key="slice.name">
            <button
              type="button"
              :aria-pressed="selected === index"
              @click="selected = selected === index ? null : index"
            >
              <i :style="{ background: slice.color }" aria-hidden="true"></i
              ><span>{{ slice.name }}</span
              ><strong
                >{{ format(slice.count) }}<small>{{ percent(slice.count) }}%</small></strong
              >
            </button>
          </li>
          <li v-if="!slices.length" class="no-data">Belum ada laporan terkirim.</li>
        </ul>
      </div>
    </section>
    <section class="visual-card" aria-labelledby="status-chart-title">
      <div class="chart-heading">
        <ChartColumnIncreasing :size="20" aria-hidden="true" />
        <h3 id="status-chart-title">Komposisi penanganan</h3>
      </div>
      <p>Status terkini dari seluruh laporan yang telah dikirim.</p>
      <div
        class="status-stack"
        role="img"
        :aria-label="statuses.map((row) => `${row.name}: ${row.count} laporan`).join(', ')"
      >
        <span
          v-for="row in statuses"
          :key="row.name"
          :style="{
            width: `${statistics.total ? (row.count / statistics.total) * 100 : 0}%`,
            background: row.color,
          }"
          ><span v-if="statistics.total && row.count / statistics.total > 0.15"
            >{{ percent(row.count) }}%</span
          ></span
        >
      </div>
      <ul class="status-list">
        <li v-for="row in statuses" :key="row.name">
          <i :style="{ background: row.color }" aria-hidden="true"></i><span>{{ row.name }}</span
          ><strong>{{ format(row.count) }}</strong
          ><small>{{ percent(row.count) }}%</small>
        </li>
      </ul>
      <p class="status-footnote">
        Selesai berarti tindak lanjut telah diselesaikan. Ditutup adalah laporan dengan keputusan
        penutupan.
      </p>
    </section>
    <section class="visual-card trend-card" aria-labelledby="trend-title">
      <div class="chart-heading">
        <TrendingUp :size="20" aria-hidden="true" />
        <h3 id="trend-title">Tren laporan masuk</h3>
        <span class="period-pill">6 bulan terakhir</span>
      </div>
      <p>
        Jumlah laporan berdasarkan bulan pengiriman dalam WIB. Bulan berjalan belum penuh. Data lama
        tanpa riwayat pengiriman memakai tanggal pembuatan laporan.
      </p>
      <div class="trend-scroll">
        <svg
          viewBox="0 0 660 235"
          class="trend-svg"
          role="img"
          aria-labelledby="trend-title trend-description"
        >
          <desc id="trend-description">
            {{ months.map((row) => `${monthLabel(row.month)}: ${row.count} laporan`).join('; ') }}
          </desc>
          <g v-for="tick in [0, 1, 2, 3]" :key="tick">
            <line
              x1="55"
              x2="605"
              :y1="190 - tick * 50"
              :y2="190 - tick * 50"
              stroke="#dce5d8"
              stroke-dasharray="4 5"
            />
            <text x="43" :y="195 - tick * 50" text-anchor="end" class="axis-label">
              {{ format(Math.ceil(maximum / 3) * tick) }}
            </text>
          </g>
          <path :d="area" fill="#dfead5" opacity="0.7" />
          <polyline
            :points="line"
            fill="none"
            stroke="#285943"
            stroke-width="3"
            stroke-linejoin="round"
          />
          <g v-for="point in points" :key="point.month">
            <circle
              :cx="point.x"
              :cy="point.y"
              r="5"
              fill="#285943"
              stroke="white"
              stroke-width="2"
            >
              <title>{{ monthLabel(point.month) }}: {{ point.count }} laporan</title>
            </circle>
            <text :x="point.x" :y="point.y - 13" text-anchor="middle" class="point-label">
              {{ format(point.count) }}
            </text>
            <text :x="point.x" y="220" text-anchor="middle" class="axis-label">
              {{ monthLabel(point.month) }}
            </text>
          </g>
        </svg>
      </div>
      <p v-if="!months.some((row) => row.count)" class="no-data">
        Belum ada laporan masuk dalam enam bulan terakhir.
      </p>
    </section>
  </div>
</template>

<style scoped>
.visual-charts {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 22px;
  margin: 22px 0;
}
.visual-card {
  padding: 28px;
  border: 1px solid #dce4d5;
  border-radius: 14px;
  background: linear-gradient(130deg, #fff, #f7f9f3);
  min-width: 0;
}
.chart-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #285943;
  flex-wrap: wrap;
}
.chart-heading h3 {
  font-size: 18px;
  margin: 0;
  color: #243d31;
}
.visual-card > p {
  color: #62705a;
  font-size: 12px;
  line-height: 1.8;
  margin: 12px 0 20px;
}
.donut-layout {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.donut-container {
  position: relative;
  width: 220px;
  margin: auto;
  flex-shrink: 0;
}
.donut {
  display: block;
  width: 100%;
}
.donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  pointer-events: none;
  gap: 5px;
}
.donut-center strong {
  font-size: 32px;
  color: #285943;
}
.donut-center span {
  font-size: 11px;
  color: #62705a;
}
.chart-legend,
.status-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.chart-legend {
  flex: 1;
  min-width: 180px;
}
.chart-legend button {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 6px;
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: #364d39;
  font-size: 11px;
}
.chart-legend button:hover,
.chart-legend button[aria-pressed='true'] {
  background: #e9f0e2;
}
.chart-legend button:focus-visible {
  outline: 2px solid #285943;
}
.chart-legend i,
.status-list i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}
.chart-legend button > span {
  flex: 1;
  overflow-wrap: anywhere;
}
.chart-legend strong {
  text-align: right;
}
.chart-legend small {
  display: block;
  margin-top: 4px;
  font-weight: 400;
  color: #62705a;
}
.status-stack {
  display: flex;
  height: 42px;
  border-radius: 9px;
  overflow: hidden;
  background: #e9eee3;
  margin: 30px 0;
}
.status-stack > span {
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 11px;
  font-weight: 700;
}
.status-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #e3e9dd;
  font-size: 12px;
}
.status-list li > span {
  flex: 1;
}
.status-list small {
  width: 50px;
  text-align: right;
  color: #62705a;
}
.visual-card .status-footnote {
  font-size: 11px;
  margin-bottom: 0;
}
.trend-card {
  grid-column: 1 / -1;
}
.period-pill {
  margin-left: auto;
  font-size: 11px;
  padding: 7px 12px;
  background: #e9f0e2;
  border-radius: 20px;
}
.trend-scroll {
  overflow-x: auto;
}
.trend-svg {
  display: block;
  width: 100%;
  min-width: 460px;
  max-height: 300px;
}
.axis-label {
  fill: #62705a;
  font-size: 11px;
}
.point-label {
  fill: #285943;
  font-size: 12px;
  font-weight: 700;
}
.no-data {
  color: #62705a;
  font-size: 12px;
  padding: 12px;
  text-align: center;
}
@media (max-width: 900px) {
  .visual-charts {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 500px) {
  .visual-card {
    padding: 20px;
  }
  .period-pill {
    margin-left: 0;
  }
}
</style>
