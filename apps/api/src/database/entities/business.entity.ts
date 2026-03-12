import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

// ════════════════════════════════════
// DOCUMENT
// ════════════════════════════════════
@Entity('documents')
@Index(['verificationId'])
@Index(['professionalId'])
@Index(['type'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'verification_id', type: 'uuid', nullable: true })
  verificationId: string | null;

  @Column({ name: 'professional_id', type: 'uuid', nullable: true })
  professionalId: string | null;

  @Column({ name: 'uploaded_by', length: 20 })
  uploadedBy: 'client' | 'pro' | 'operator' | 'system';

  @Column({ name: 'uploader_id', type: 'uuid', nullable: true })
  uploaderId: string | null;

  @Column({ length: 50 })
  type: string;

  @Column({ name: 'original_filename', length: 255, nullable: true })
  originalFilename: string | null;

  @Column({ name: 'storage_key', length: 512 })
  storageKey: string;

  @Column({ name: 'file_size', nullable: true })
  fileSize: number | null;

  @Column({ name: 'mime_type', length: 100, nullable: true })
  mimeType: string | null;

  @Column({ name: 'checksum_sha256', length: 64, nullable: true })
  checksumSha256: string | null;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ name: 'expires_at', type: 'date', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'validated_by', type: 'uuid', nullable: true })
  validatedBy: string | null;

  @Column({ name: 'validated_at', type: 'timestamptz', nullable: true })
  validatedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'ai_detected_type', length: 50, nullable: true })
  aiDetectedType: string | null;

  @Column({ name: 'ai_metadata', type: 'jsonb', nullable: true })
  aiMetadata: Record<string, any> | null;

  @Column({ name: 'ai_confidence', type: 'decimal', precision: 5, scale: 2, nullable: true })
  aiConfidence: number | null;

  @Column({ default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}

// ════════════════════════════════════
// SCORING RECORD
// ════════════════════════════════════
@Entity('scoring_records')
@Index(['verificationId'])
export class ScoringRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'verification_id', type: 'uuid' })
  verificationId: string;

  @Column({ name: 'computed_by', length: 20 })
  computedBy: 'ai' | 'operator' | 'system';

  @Column({ name: 'operator_id', type: 'uuid', nullable: true })
  operatorId: string | null;

  @Column({ name: 'algorithm_version', length: 10, default: '1.0' })
  algorithmVersion: string;

  @Column({ name: 'score_total', type: 'decimal', precision: 3, scale: 1 })
  scoreTotal: number;

  @Column({ name: 'score_documents', type: 'decimal', precision: 3, scale: 1 })
  scoreDocuments: number;

  @Column({ name: 'score_insurance', type: 'decimal', precision: 3, scale: 1 })
  scoreInsurance: number;

  @Column({ name: 'score_seniority', type: 'decimal', precision: 3, scale: 1 })
  scoreSeniority: number;

  @Column({ name: 'score_morality', type: 'decimal', precision: 3, scale: 1 })
  scoreMorality: number;

  @Column({ name: 'score_bonus', type: 'decimal', precision: 3, scale: 1, default: 0 })
  scoreBonus: number;

  @Column({ length: 20 })
  verdict: 'recommended' | 'watch' | 'risk';

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  confidence: number | null;

  @Column({ type: 'text', array: true, nullable: true })
  flags: string[] | null;

  @Column({ type: 'text', nullable: true })
  reasoning: string | null;

  @Column({ name: 'input_snapshot', type: 'jsonb', nullable: true })
  inputSnapshot: Record<string, any> | null;

  @Column({ name: 'is_final', default: false })
  isFinal: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

// ════════════════════════════════════
// PAYMENT
// ════════════════════════════════════
@Entity('payments')
@Index(['userId'])
@Index(['stripePaymentId'])
@Index(['status'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'verification_id', type: 'uuid', nullable: true })
  verificationId: string | null;

  @Column({ name: 'stripe_payment_id', length: 255, unique: true, nullable: true })
  stripePaymentId: string | null;

  @Column({ name: 'stripe_subscription_id', length: 255, nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'EUR' })
  currency: string;

  @Column({ length: 20 })
  type: 'one_time' | 'subscription' | 'refund';

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ name: 'payment_method', length: 30, nullable: true })
  paymentMethod: string | null;

  @Column({ name: 'receipt_url', type: 'text', nullable: true })
  receiptUrl: string | null;

  @Column({ name: 'refund_reason', type: 'text', nullable: true })
  refundReason: string | null;

  @Column({ name: 'refunded_by', type: 'uuid', nullable: true })
  refundedBy: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

// ════════════════════════════════════
// WEBHOOK EVENT (idempotence)
// ════════════════════════════════════
@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 30 })
  provider: string;

  @Column({ name: 'external_event_id', length: 255 })
  externalEventId: string;

  @Column({ name: 'event_type', length: 100 })
  eventType: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any> | null;

  @Column({ default: false })
  processed: boolean;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

// ════════════════════════════════════
// AI JOB
// ════════════════════════════════════
@Entity('ai_jobs')
@Index(['verificationId'])
@Index(['status'])
@Index(['jobType'])
export class AiJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'verification_id', type: 'uuid', nullable: true })
  verificationId: string | null;

  @Column({ name: 'professional_id', type: 'uuid', nullable: true })
  professionalId: string | null;

  @Column({ name: 'job_type', length: 50 })
  jobType: string;

  @Column({ length: 20, default: 'queued' })
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

  @Column({ length: 50, nullable: true })
  provider: string | null;

  @Column({ name: 'model_version', length: 50, nullable: true })
  modelVersion: string | null;

  @Column({ name: 'input_data', type: 'jsonb', nullable: true })
  inputData: Record<string, any> | null;

  @Column({ name: 'output_data', type: 'jsonb', nullable: true })
  outputData: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 3 })
  maxRetries: number;

  @Column({ name: 'duration_ms', nullable: true })
  durationMs: number | null;

  @Column({ name: 'cost_cents', nullable: true })
  costCents: number | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

// ════════════════════════════════════
// CASE EVENT (timeline)
// ════════════════════════════════════
@Entity('case_events')
@Index(['verificationId'])
@Index(['createdAt'])
export class CaseEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'verification_id', type: 'uuid' })
  verificationId: string;

  @Column({ name: 'event_type', length: 50 })
  eventType: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_role', length: 20, nullable: true })
  actorRole: string | null;

  @Column({ name: 'from_status', length: 30, nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', length: 30, nullable: true })
  toStatus: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

// ════════════════════════════════════
// NOTIFICATION
// ════════════════════════════════════
@Entity('notifications')
@Index(['userId'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'verification_id', type: 'uuid', nullable: true })
  verificationId: string | null;

  @Column({ length: 30 })
  type: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ length: 20 })
  channel: 'push' | 'email' | 'sms' | 'in_app';

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

// ════════════════════════════════════
// PRO COMMUNICATION
// ════════════════════════════════════
@Entity('pro_communications')
@Index(['verificationId'])
export class ProCommunication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'verification_id', type: 'uuid' })
  verificationId: string;

  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId: string;

  @Column({ length: 10 })
  channel: 'sms' | 'email';

  @Column({ length: 30 })
  type: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ name: 'content_snapshot', type: 'text', nullable: true })
  contentSnapshot: string | null;

  @Column({ name: 'external_id', length: 255, nullable: true })
  externalId: string | null;

  @Column({ length: 20, default: 'queued' })
  status: string;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
