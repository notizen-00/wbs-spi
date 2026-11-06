export const stages = [
  'DRAFT',
  'SUBMITTED',
  'INITIAL_REVIEW',
  'ASSIGNMENT_APPROVAL',
  'INVESTIGATION',
  'RESULT_REVIEW',
  'RESULT_APPROVAL',
  'FOLLOW_UP',
  'CLOSURE_APPROVAL',
  'COMPLETED',
  'CLOSED',
] as const;
export type Stage = (typeof stages)[number];
export type Role = 'REPORTER' | 'MANAGER' | 'INVESTIGATOR' | 'OFFICIAL' | 'EXECUTOR' | 'ADMIN';
export const stageLabels: Record<Stage, string> = {
  DRAFT: 'Draf',
  SUBMITTED: 'Terkirim',
  INITIAL_REVIEW: 'Verifikasi awal',
  ASSIGNMENT_APPROVAL: 'Persetujuan penugasan',
  INVESTIGATION: 'Pemeriksaan',
  RESULT_REVIEW: 'Review hasil',
  RESULT_APPROVAL: 'Persetujuan hasil',
  FOLLOW_UP: 'Tindak lanjut',
  CLOSURE_APPROVAL: 'Persetujuan penutupan',
  COMPLETED: 'Selesai',
  CLOSED: 'Ditutup',
};
export interface ReportPayload {
  title: string;
  category: string;
  what: string;
  who: string;
  when: string;
  where: string;
  why: string;
  how: string;
  confidentiality: 'PROTECTED' | 'IDENTIFIED';
  evidenceReason: string;
}
export interface Report {
  id: string;
  number: string | null;
  stage: Stage;
  lifecycle: string;
  version: number;
  payload: ReportPayload;
  createdAt: string;
  updatedAt: string;
  clarification?: { question: string; response?: string };
  events?: { action: string; reason: string; createdAt: string }[];
}
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  verified: boolean;
}
