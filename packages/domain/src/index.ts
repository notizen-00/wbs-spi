import type { Stage, Role, ReportPayload } from '@wbs/contracts';
const transitions: Partial<Record<Stage, { next: Stage; role: Role }>> = {
  SUBMITTED: { next: 'INITIAL_REVIEW', role: 'INVESTIGATOR' },
  INITIAL_REVIEW: { next: 'ASSIGNMENT_APPROVAL', role: 'INVESTIGATOR' },
  ASSIGNMENT_APPROVAL: { next: 'INVESTIGATION', role: 'OFFICIAL' },
  INVESTIGATION: { next: 'RESULT_REVIEW', role: 'INVESTIGATOR' },
  RESULT_REVIEW: { next: 'RESULT_APPROVAL', role: 'INVESTIGATOR' },
  RESULT_APPROVAL: { next: 'FOLLOW_UP', role: 'OFFICIAL' },
  FOLLOW_UP: { next: 'CLOSURE_APPROVAL', role: 'INVESTIGATOR' },
  CLOSURE_APPROVAL: { next: 'COMPLETED', role: 'OFFICIAL' },
};
export function nextStage(stage: Stage, role: Role, actor: string, proposer: string | null): Stage {
  const t = transitions[stage];
  if (!t || t.role !== role) throw new Error('Tindakan tidak diizinkan pada tahap ini.');
  if (role === 'OFFICIAL' && actor === proposer)
    throw new Error('Pengusul tidak dapat menyetujui usulan sendiri.');
  return t.next;
}
export function validateSubmission(p: ReportPayload) {
  for (const field of [
    'title',
    'category',
    'what',
    'who',
    'when',
    'where',
    'why',
    'how',
    'evidenceReason',
  ] as const)
    if (typeof p[field] !== 'string' || !p[field].trim())
      throw new Error(`Lengkapi kolom ${field}.`);
  if (!['PROTECTED', 'IDENTIFIED'].includes(p.confidentiality))
    throw new Error('Pilihan kerahasiaan tidak valid.');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(p.when) ||
    !Number.isFinite(Date.parse(p.when)) ||
    new Date(p.when).toISOString().slice(0, 10) !== p.when
  )
    throw new Error('Tanggal kejadian tidak valid.');
}
