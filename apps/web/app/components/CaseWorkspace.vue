<script setup lang="ts">
import {
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  History,
  CheckCircle2,
  UserRoundPlus,
  Archive,
  Undo2,
  FileCheck2,
  ClipboardCheck,
  RotateCcw,
  Pause,
  Play,
  Scale,
  FileSearch,
  ClipboardPen,
  TriangleAlert,
} from '@lucide/vue';
import type { Report, User } from '@wbs/contracts';
import { formatDateTime } from '../utils/date-time';
import { createRequestKey } from '../utils/request-key';
const props = defineProps<{ report: Report; user: User }>();
const emit = defineEmits<{ updated: [] }>();
const actionIcons = {
  PROPOSE_ASSIGNMENT: UserRoundPlus,
  FORWARD_TO_OFFICIAL: ArrowRight,
  PROPOSE_CLOSURE: Archive,
  CLOSE_NO_FOLLOW_UP: Archive,
  REVIEW_FINDING: Undo2,
  PROPOSE_RESULT: FileCheck2,
  REVIEW_EXECUTION: ClipboardCheck,
  PROPOSE_REOPEN: RotateCcw,
  REQUEST_REOPEN: RotateCcw,
  SUSPEND: Pause,
  RESUME: Play,
  DECIDE: Scale,
  FINDING: FileSearch,
  EXECUTE: ClipboardPen,
  CONFLICT: TriangleAlert,
};
const evidence = ref<any[]>([]);
const data = ref<any>({}),
  error = ref(''),
  busy = ref(false),
  action = ref(''),
  reason = ref('');
const fields = reactive({
  assigneeId: '',
  summary: '',
  executorId: '',
  instruction: '',
  content: '',
  execution: '',
  taskId: '',
  evidenceId: '',
  response: '',
  outcome: 'CLOSED',
  targetStage: 'INITIAL_REVIEW',
  evaluationAt: '',
  conditions: '',
});
const verifier = computed(() => props.user.role === 'INVESTIGATOR');
const pending = computed(() => data.value.proposals?.find((p: any) => p.status === 'PENDING'));
async function load() {
  try {
    evidence.value = await $fetch<any[]>('/api/v1/reports/' + props.report.id + '/evidence');
    data.value = await $fetch(`/api/v1/reports/${props.report.id}/workspace`);
  } catch (e: any) {
    error.value = e?.data?.message || 'Konfigurasi perkara belum tersedia.';
  }
}
defineExpose({ refresh: load });
watch(() => [props.report.id, props.report.version], load, { immediate: true });
async function send(decision?: string) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await $fetch(`/api/v1/reports/${props.report.id}/commands`, {
      method: 'POST',
      headers: { 'Idempotency-Key': createRequestKey() },
      body: {
        action: action.value,
        reason: reason.value,
        expectedVersion: props.report.version,
        ...fields,
        decision,
      },
    });
    action.value = '';
    reason.value = '';
    emit('updated');
    await load();
  } catch (e: any) {
    error.value = e?.data?.message || 'Tindakan gagal. Silakan coba kembali.';
  } finally {
    busy.value = false;
  }
}
const actions = computed(() => {
  const result: { id: string; label: string }[] = [];
  const r = props.report;
  if (props.user.role === 'REPORTER') {
    if (
      ['COMPLETED', 'CLOSED'].includes(r.stage) &&
      !data.value.reopenRequests?.some((v: any) => v.status === 'PENDING')
    )
      result.push({ id: 'REQUEST_REOPEN', label: 'Ajukan pembukaan kembali' });
    return result;
  }
  if (r.lifecycle === 'SUSPENDED') {
    if (props.user.role === 'OFFICIAL')
      result.push({ id: 'RESUME', label: 'Evaluasi & lanjutkan' });
    return result;
  }
  const reopenPending = data.value.reopenRequests?.some((v: any) => v.status === 'PENDING');
  if (verifier.value) {
    if (['INITIAL_REVIEW', 'RESULT_REVIEW'].includes(r.stage))
      result.push(
        { id: 'FORWARD_TO_OFFICIAL', label: 'Teruskan ke pejabat' },
        { id: 'CLOSE_NO_FOLLOW_UP', label: 'Tolak laporan' },
      );
    if (r.stage === 'FOLLOW_UP')
      result.push(
        { id: 'REVIEW_EXECUTION', label: 'Periksa pelaksanaan' },
        { id: 'FORWARD_TO_OFFICIAL', label: 'Teruskan ke pejabat' },
      );
    if (['COMPLETED', 'CLOSED'].includes(r.stage) && reopenPending && !data.value.reopenForwarded)
      result.push({ id: 'FORWARD_TO_OFFICIAL', label: 'Teruskan ke pejabat' });
  }
  if (props.user.role === 'OFFICIAL') {
    if (r.stage === 'ASSIGNMENT_APPROVAL')
      result.push(
        { id: 'PROPOSE_RESULT', label: 'Tugaskan pelaksana' },
        { id: 'CLOSE_NO_FOLLOW_UP', label: 'Tolak laporan' },
      );
    if (r.stage === 'RESULT_APPROVAL')
      result.push(
        { id: 'PROPOSE_RESULT', label: 'Tugaskan pelaksana' },
        { id: 'CLOSE_NO_FOLLOW_UP', label: 'Tolak laporan' },
      );
    if (r.stage === 'CLOSURE_APPROVAL')
      result.push({ id: 'PROPOSE_CLOSURE', label: 'Tetapkan penutupan' });
    if (['COMPLETED', 'CLOSED'].includes(r.stage) && reopenPending && data.value.reopenForwarded)
      result.push({ id: 'PROPOSE_REOPEN', label: 'Buka kembali laporan' });
    if (['INVESTIGATION', 'FOLLOW_UP'].includes(r.stage))
      result.push({ id: 'SUSPEND', label: 'Tunda perkara' });
  }
  if (
    props.user.role === 'INVESTIGATOR' &&
    r.stage === 'INVESTIGATION' &&
    data.value.canSubmitFinding
  )
    result.push({ id: 'FINDING', label: 'Serahkan hasil pemeriksaan' });
  if (props.user.role === 'EXECUTOR' && r.stage === 'FOLLOW_UP')
    result.push({ id: 'EXECUTE', label: 'Catat pelaksanaan' });
  return result;
});
</script>
<template>
  <section class="case-workspace">
    <h3>
      <ShieldCheck :size="19" />{{
        user.role === 'REPORTER' ? 'Jawaban & tindak lanjut' : 'Dashboard perkara'
      }}
    </h3>
    <div v-if="actions.length" class="workspace-actions">
      <button
        v-for="a in actions"
        :key="a.id"
        class="button action-button"
        :class="{
          chosen: action === a.id,
          danger: a.id === 'CLOSE_NO_FOLLOW_UP',
          warning: ['SUSPEND', 'CONFLICT', 'REVIEW_FINDING'].includes(a.id),
          positive: !['CLOSE_NO_FOLLOW_UP', 'SUSPEND', 'CONFLICT', 'REVIEW_FINDING'].includes(a.id),
        }"
        :aria-pressed="action === a.id"
        :disabled="busy"
        @click="
          action = a.id;
          error = '';
        "
      >
        <component
          :is="actionIcons[a.id as keyof typeof actionIcons]"
          :size="17"
          aria-hidden="true"
        />
        {{ a.label }}
      </button>
    </div>
    <div v-if="report.lifecycle === 'SUSPENDED'" class="info-box">
      Perkara sedang ditunda. Tahap asal tetap tersimpan sampai evaluasi pelanjutan.
    </div>
    <div v-if="error" class="alert error" role="alert"><AlertCircle :size="17" />{{ error }}</div>
    <article v-for="r in data.officialResponses" class="workspace-card">
      <strong>Jawaban resmi · {{ r.outcome === 'COMPLETED' ? 'Selesai' : 'Ditutup' }}</strong>
      <p>{{ r.content }}</p>
      <time v-if="r.created_at" :datetime="r.created_at">{{ formatDateTime(r.created_at) }}</time>
    </article>
    <article v-for="r in data.reopenRequests" class="workspace-card">
      <strong>Permintaan pembukaan kembali · {{ r.status }}</strong>
      <p>{{ r.reason }}</p>
    </article>
    <template v-if="user.role !== 'REPORTER'">
      <article v-for="f in data.findings" class="workspace-card">
        <strong>Hasil pemeriksaan</strong>
        <p>{{ f.content }}</p>
        <time v-if="f.created_at" :datetime="f.created_at">{{ formatDateTime(f.created_at) }}</time>
      </article>
      <article v-for="t in data.tasks" class="workspace-card">
        <strong>Tugas tindak lanjut · {{ t.status }}</strong>
        <p>{{ t.instruction }}</p>
        <p v-if="t.executor">Pelaksana: {{ t.executor.name }}</p>
        <p v-if="t.execution">Pelaksanaan: {{ t.execution }}</p>
      </article>
      <article v-if="pending" class="workspace-card proposal">
        <strong>Proposal menunggu keputusan · {{ pending.type }}</strong>
        <p v-if="pending.payload.summary">{{ pending.payload.summary }}</p>
        <p v-if="pending.payload.instruction">{{ pending.payload.instruction }}</p>
        <p v-if="pending.payload.response">Jawaban resmi: {{ pending.payload.response }}</p>
        <p v-if="pending.payload.outcome">Hasil: {{ pending.payload.outcome }}</p>
        <p v-if="pending.payload.targetStage">Tahap tujuan: {{ pending.payload.targetStage }}</p>
      </article>
    </template>
    <form
      v-if="action"
      class="fields workspace-form"
      @submit.prevent="send(action === 'REVIEW_FINDING' ? 'RETURN' : undefined)"
    >
      <h4>{{ actions.find((a) => a.id === action)?.label }}</h4>
      <template
        v-if="
          action === 'PROPOSE_RESULT' ||
          (action === 'DECIDE' && ['RESULT', 'ASSIGNMENT'].includes(pending?.type))
        "
      >
        <label
          >Pelaksana tindak lanjut (ditentukan pejabat)<select
            v-model="fields.executorId"
            aria-label="Pelaksana tindak lanjut"
            required
          >
            <option value="" disabled>Pilih pelaksana</option>
            <option
              v-for="u in data.users?.filter((u: any) => u.role === 'EXECUTOR')"
              :value="u.id"
            >
              {{ u.name }}
            </option>
          </select></label
        >
      </template>
      <template v-if="action === 'PROPOSE_RESULT'"
        ><label
          >Rencana & bukti pelaksanaan yang dibutuhkan<textarea
            v-model="fields.instruction"
            rows="4"
            required
          ></textarea></label
      ></template>
      <label v-if="action === 'FINDING'"
        >Hasil pemeriksaan & rekomendasi<textarea
          v-model="fields.content"
          rows="7"
          required
        ></textarea>
      </label>
      <template v-if="['EXECUTE', 'REVIEW_EXECUTION'].includes(action)"
        ><label
          >Tugas<select v-model="fields.taskId" required>
            <option value="" disabled>Pilih tugas</option>
            <option v-for="t in data.tasks" :value="t.id">{{ t.instruction }}</option>
          </select></label
        ><template v-if="action === 'EXECUTE'"
          ><label
            >Bukti pelaksanaan<select v-model="fields.evidenceId" required>
              <option value="" disabled>Pilih bukti yang lolos pemindaian</option>
              <option v-for="e in evidence.filter((e: any) => e.status === 'READY')" :value="e.id">
                {{ e.name }}
              </option>
            </select></label
          ><label
            >Pelaksanaan<textarea v-model="fields.execution" rows="4" required></textarea></label
        ></template>
        <div v-else class="info-box">
          Periksa bukti pelaksanaan sebelum menyetujui. Bukti harus telah lolos pemindaian keamanan.
        </div></template
      >
      <template v-if="action === 'PROPOSE_CLOSURE'"
        ><label
          >Hasil penutupan<select v-model="fields.outcome">
            <option value="CLOSED">Ditutup — alasan lain</option>
            <option value="COMPLETED">Selesai — tindak lanjut tuntas</option>
          </select></label
        ><label
          >Jawaban resmi yang aman untuk pelapor<textarea
            v-model="fields.response"
            rows="5"
            required
          ></textarea></label
      ></template>
      <template v-if="action === 'SUSPEND'"
        ><label
          >Tanggal evaluasi<input
            v-model="fields.evaluationAt"
            type="datetime-local"
            required /></label
        ><label
          >Syarat melanjutkan<textarea
            v-model="fields.conditions"
            required
            rows="3"
          ></textarea></label
      ></template>
      <label v-if="action === 'PROPOSE_REOPEN'"
        >Tahap tujuan<select v-model="fields.targetStage">
          <option value="INITIAL_REVIEW">Verifikasi awal</option>
          <option value="INVESTIGATION">Pemeriksaan</option>
        </select></label
      >
      <div v-if="action === 'CONFLICT'" class="info-box">
        Pernyataan konflik langsung mencabut akses Anda ke perkara dan penugasan terkait. Pengalihan
        akses dilakukan oleh pihak berwenang.
      </div>
      <label
        >{{
          action === 'FORWARD_TO_OFFICIAL'
            ? 'Catatan penerusan (ditampilkan kepada pelapor)'
            : action === 'CLOSE_NO_FOLLOW_UP'
              ? 'Alasan penolakan (ditampilkan kepada pelapor)'
              : action === 'REQUEST_REOPEN'
                ? 'Alasan & informasi baru'
                : 'Alasan / catatan keputusan'
        }}<textarea v-model="reason" rows="4" required maxlength="10000"></textarea>
      </label>
      <p v-if="action === 'CLOSE_NO_FOLLOW_UP'" class="info-box">
        Laporan ditolak dan langsung ditutup. Alasan yang Anda tulis akan ditampilkan pada timeline
        pelapor.
      </p>
      <div class="workspace-submit">
        <template v-if="action === 'DECIDE'"
          ><button
            type="button"
            class="button warning"
            :disabled="busy || !reason.trim()"
            @click="send('RETURN')"
          >
            Kembalikan</button
          ><button
            type="button"
            class="button"
            :disabled="
              busy ||
              !reason.trim() ||
              (pending?.type === 'RESULT' && !fields.executorId) ||
              (pending?.type === 'ASSIGNMENT' && !fields.executorId)
            "
            @click="send('APPROVE')"
          >
            Setujui<CheckCircle2 :size="16" /></button></template
        ><template v-else-if="action === 'REVIEW_EXECUTION'"
          ><button
            type="button"
            class="button warning"
            :disabled="busy || !reason.trim()"
            @click="send('RETURN')"
          >
            Kembalikan untuk perbaikan</button
          ><button
            type="button"
            class="button"
            :disabled="busy || !reason.trim()"
            @click="send('VERIFY')"
          >
            Verifikasi
          </button></template
        ><button
          v-else
          class="button"
          :class="{
            danger: action === 'CLOSE_NO_FOLLOW_UP',
            warning: ['SUSPEND', 'REVIEW_FINDING', 'CONFLICT'].includes(action),
          }"
          :disabled="busy"
        >
          {{
            busy
              ? 'Menyimpan…'
              : action === 'CLOSE_NO_FOLLOW_UP'
                ? 'Tolak dan tutup laporan'
                : 'Simpan tindakan'
          }}<ArrowRight :size="16" />
        </button>
        <button
          type="button"
          class="button secondary neutral"
          :disabled="busy"
          @click="
            action = '';
            reason = '';
          "
        >
          Batal
        </button>
      </div>
    </form>
  </section>
</template>
