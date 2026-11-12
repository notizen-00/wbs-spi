import { stageLabels, type Stage } from '@wbs/contracts';

export function caseNotification(
  action: string,
  stage: string,
  number: string | null,
  role: string,
  decision?: string,
  previousStage?: string,
) {
  const titles: Record<string, string> = {
    SUBMIT: role === 'REPORTER' ? 'Laporan berhasil dikirim' : 'Laporan baru diterima',
    ADVANCE: 'Verifikasi awal dimulai',
    CLARIFY: 'Klarifikasi laporan diperlukan',
    RESPOND: 'Jawaban klarifikasi diterima',
    PROPOSE_ASSIGNMENT: 'Usulan penugasan menunggu persetujuan',
    FINDING: 'Hasil pemeriksaan telah diserahkan',
    REVIEW_FINDING: 'Hasil pemeriksaan perlu diperbaiki',
    PROPOSE_RESULT: 'Usulan tindak lanjut menunggu persetujuan',
    EXECUTE: 'Pelaksanaan tindak lanjut telah diserahkan',
    REVIEW_EXECUTION:
      decision === 'VERIFY'
        ? 'Tindak lanjut telah diverifikasi'
        : 'Pelaksanaan tindak lanjut perlu diperbaiki',
    PROPOSE_CLOSURE: 'Usulan penutupan menunggu persetujuan',
    SUSPEND: 'Penanganan laporan ditunda',
    RESUME: 'Penanganan laporan dilanjutkan',
    REQUEST_REOPEN: 'Permintaan pembukaan kembali diterima',
    PROPOSE_REOPEN: 'Usulan pembukaan kembali menunggu persetujuan',
    CONFLICT: 'Konflik kepentingan telah dicatat',
  };
  let title = titles[action] ?? 'Status laporan diperbarui';
  if (action === 'DECIDE')
    title =
      decision === 'RETURN'
        ? 'Usulan dikembalikan untuk ditelaah'
        : ({
            INVESTIGATION: 'Penugasan pemeriksaan disetujui',
            FOLLOW_UP: 'Tindak lanjut disetujui',
            COMPLETED: 'Laporan selesai ditangani',
            CLOSED: 'Laporan telah ditutup',
            INITIAL_REVIEW: 'Pembukaan kembali laporan disetujui',
          }[stage] ?? 'Usulan disetujui');
  if (
    action === 'DECIDE' &&
    decision === 'APPROVE' &&
    ['COMPLETED', 'CLOSED'].includes(previousStage ?? '')
  )
    title = 'Pembukaan kembali laporan disetujui';
  // Public recipients receive public progress, without internal proposal or conflict details.
  if (
    role === 'REPORTER' &&
    [
      'PROPOSE_ASSIGNMENT',
      'PROPOSE_RESULT',
      'PROPOSE_CLOSURE',
      'FINDING',
      'REVIEW_FINDING',
      'PROPOSE_REOPEN',
      'CONFLICT',
    ].includes(action)
  )
    title = 'Perkembangan penanganan laporan';
  let instruction = 'Buka portal WBS untuk melihat perkembangan laporan.';
  if (role === 'REPORTER' && action === 'CLARIFY')
    instruction = 'Buka laporan dan jawab permintaan klarifikasi verifikator/pemeriksa.';
  else if (role === 'REPORTER' && ['COMPLETED', 'CLOSED'].includes(stage))
    instruction = 'Buka laporan untuk membaca jawaban resmi yang telah diterbitkan.';
  else if (role === 'OFFICIAL' && action.startsWith('PROPOSE_'))
    instruction = 'Tinjau usulan dan berikan keputusan sesuai mandat Anda.';
  else if (role === 'INVESTIGATOR' && stage === 'INVESTIGATION')
    instruction = 'Periksa penugasan aktif dan lengkapi hasil pemeriksaan.';
  else if (role === 'EXECUTOR' && stage === 'FOLLOW_UP')
    instruction = 'Periksa tugas Anda, laksanakan instruksi, dan lengkapi bukti pelaksanaan.';
  else if (
    role === 'INVESTIGATOR' &&
    ['SUBMIT', 'RESPOND', 'FINDING', 'EXECUTE', 'REQUEST_REOPEN'].includes(action)
  )
    instruction =
      'Buka ruang kerja perkara untuk menelaah pembaruan dan menentukan langkah berikutnya.';
  const reference = number ? `Laporan ${number}` : 'Laporan WBS';
  return {
    title,
    subject: `${reference}: ${title}`,
    message: `${reference}. Status: ${stageLabels[stage as Stage] ?? stage}. ${instruction}`,
  };
}

export function outboxNotification(kind: string, payload: Record<string, any>) {
  if (kind === 'VERIFY')
    return {
      title: 'Verifikasi alamat email',
      subject: 'WBS — Verifikasi alamat email Anda',
      message:
        'Verifikasi alamat email melalui tautan yang dikirim ke email Anda agar dapat mengirim laporan.',
    };
  if (kind === 'RESET')
    return {
      title: 'Permintaan pengaturan ulang kata sandi',
      subject: 'WBS — Atur ulang kata sandi akun Anda',
      message:
        'Permintaan pengaturan ulang kata sandi diterima. Periksa email Anda untuk melanjutkan.',
    };
  return {
    title: typeof payload.title === 'string' ? payload.title : 'Pembaruan laporan WBS',
    subject:
      typeof payload.subject === 'string' ? payload.subject : 'WBS — Pembaruan penanganan laporan',
    message:
      typeof payload.message === 'string'
        ? payload.message
        : 'Ada pembaruan penanganan laporan. Masuk ke portal WBS untuk melihat status terbaru.',
  };
}

export function notificationContext(kind: string, payload: Record<string, any>) {
  const target = typeof payload.targetPath === 'string' ? payload.targetPath : '';
  const valid =
    /^\/reports\/[a-f0-9-]{36}$/i.test(target) ||
    ['/dashboard', '/reports', '/help', '/admin/settings', '/admin/categories'].includes(target);
  return {
    kind:
      typeof payload.notificationKind === 'string' ? payload.notificationKind.slice(0, 60) : kind,
    targetPath: valid ? target : ['VERIFY', 'RESET'].includes(kind) ? '/help' : '/dashboard',
  };
}
