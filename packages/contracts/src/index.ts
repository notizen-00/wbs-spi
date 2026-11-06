export interface NotificationItem {
  id: string;
  title?: string;
  subject?: string;
  message: string;
  created_at: string;
}
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
export type Role =
  'REPORTER' | 'MANAGER' | 'INVESTIGATOR' | 'OFFICIAL' | 'EXECUTOR' | 'ADMIN' | 'SUPER_ADMIN';
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
  trackingCode?: string;
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

export const EVIDENCE_MAX_BYTES = 20 * 1024 * 1024;
export const EVIDENCE_MAX_FILES = 10;
export const evidenceTypes = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/bmp': ['bmp'],
  'image/tiff': ['tif', 'tiff'],
  'image/avif': ['avif'],
  'image/heic': ['heic', 'heif'],
  'image/heif': ['heif', 'heic'],
  'audio/mpeg': ['mp3'],
  'video/mp4': ['mp4'],
  'video/quicktime': ['mov'],
  'video/webm': ['webm'],
  'video/matroska': ['mkv'],
  'video/vnd.avi': ['avi'],
  'video/mpeg': ['mpeg', 'mpg'],
  'video/3gpp': ['3gp'],
  'video/3gpp2': ['3g2'],
  'video/x-m4v': ['m4v'],
} as const;
export const evidenceExtensions: readonly string[] = [
  ...new Set(Object.values(evidenceTypes).flat()),
];
export const evidenceAccept = [
  ...evidenceExtensions.map((ext) => `.${ext}`),
  ...Object.keys(evidenceTypes),
].join(',');
export const evidenceFormatLabel =
  'PDF, gambar, MP3, video (MP4, MOV, WebM, MKV, AVI, MPEG, 3GP, M4V)';
