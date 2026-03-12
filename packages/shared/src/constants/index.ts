// ============================================================
// CheckMyPro — Shared Constants
// Used by API, Worker, Back-office, Mobile
// ============================================================

export const VERIFICATION_STATUSES = {
  PENDING_PAYMENT: 'pending_payment',
  PAID: 'paid',
  AI_ANALYSIS: 'ai_analysis',
  AWAITING_PRO_DOCS: 'awaiting_pro_docs',
  PRO_DOCS_RECEIVED: 'pro_docs_received',
  READY_FOR_REVIEW: 'ready_for_review',
  IN_PROGRESS: 'in_progress',
  QUALITY_CONTROL: 'quality_control',
  COMPLETED: 'completed',
  DISPUTE: 'dispute',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

export type VerificationStatus = typeof VERIFICATION_STATUSES[keyof typeof VERIFICATION_STATUSES];

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  pending_payment: 'En attente de paiement',
  paid: 'Payé',
  ai_analysis: 'Analyse IA en cours',
  awaiting_pro_docs: 'Attente documents pro',
  pro_docs_received: 'Documents reçus',
  ready_for_review: 'Prêt pour revue',
  in_progress: 'En traitement',
  quality_control: 'Contrôle qualité',
  completed: 'Terminé',
  dispute: 'Litige',
  cancelled: 'Annulé',
  refunded: 'Remboursé',
};

export const ALLOWED_TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['ai_analysis'],
  ai_analysis: ['awaiting_pro_docs', 'ready_for_review'],
  awaiting_pro_docs: ['pro_docs_received', 'ready_for_review'],
  pro_docs_received: ['ready_for_review'],
  ready_for_review: ['in_progress'],
  in_progress: ['quality_control', 'completed'],
  quality_control: ['completed', 'in_progress'],
  completed: ['dispute'],
  dispute: ['in_progress', 'completed'],
  cancelled: [],
  refunded: [],
};

export const USER_ROLES = {
  USER: 'user',
  PRO: 'pro',
  OPERATOR: 'operator',
  OPERATOR_SENIOR: 'operator_senior',
  SUPERVISOR: 'supervisor',
  ADMIN: 'admin',
  AUDITOR: 'auditor',
} as const;

export const STAFF_ROLES = [
  USER_ROLES.OPERATOR,
  USER_ROLES.OPERATOR_SENIOR,
  USER_ROLES.SUPERVISOR,
  USER_ROLES.ADMIN,
  USER_ROLES.AUDITOR,
];

export const CLIENT_TYPES = {
  B2C: 'b2c',
  B2B: 'b2b',
  COPRO: 'copro',
  HLM: 'hlm',
} as const;

export const URGENCY_LEVELS = {
  STANDARD: 'standard',
  PRIORITY: 'priority',
  EXPRESS: 'express',
} as const;

export const SLA_HOURS: Record<string, number> = {
  standard: 48,
  priority: 24,
  express: 4,
};

export const VERDICTS = {
  RECOMMENDED: 'recommended',
  WATCH: 'watch',
  RISK: 'risk',
} as const;

export const VERDICT_LABELS: Record<string, string> = {
  recommended: 'Recommandé',
  watch: 'À surveiller',
  risk: 'Risque élevé',
};

export const SCORING = {
  MAX_SCORE: 5,
  BONUS_MAX: 0.5,
  RADIEE_CAP: 2.0,
  LIQUIDATION_CAP: 1.0,
  RECOMMENDED_THRESHOLD: 4.0,
  WATCH_THRESHOLD: 2.5,
} as const;

export const DOCUMENT_TYPES = {
  KBIS: 'kbis',
  URSSAF: 'urssaf',
  INSURANCE_RC: 'insurance_rc',
  INSURANCE_DECENNIAL: 'insurance_decennial',
  CERTIFICATION: 'certification',
  QUOTE: 'quote',
  IDENTITY: 'identity',
  OTHER: 'other',
  UNKNOWN: 'unknown',
} as const;

export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
  MAX_FILES_PER_CASE: 20,
  ALLOWED_MIME_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
  PRESIGNED_URL_EXPIRY: 900, // 15 minutes
  DOWNLOAD_URL_EXPIRY: 3600, // 1 hour
} as const;

export const RATE_LIMITS = {
  LOGIN: { ttl: 60, limit: 5 },
  REGISTER: { ttl: 60, limit: 3 },
  OTP_RESEND: { ttl: 3600, limit: 3 },
  CREATE_VERIFICATION: { ttl: 60, limit: 10 },
  OCR_SCAN: { ttl: 60, limit: 5 },
  PRO_UPLOAD: { ttl: 60, limit: 20 },
} as const;
