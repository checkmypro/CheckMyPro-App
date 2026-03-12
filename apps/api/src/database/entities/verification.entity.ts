import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, Index, ManyToOne, JoinColumn, OneToMany, VersionColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum VerificationStatus {
  PENDING_PAYMENT = 'pending_payment',
  PAID = 'paid',
  AI_ANALYSIS = 'ai_analysis',
  AWAITING_PRO_DOCS = 'awaiting_pro_docs',
  PRO_DOCS_RECEIVED = 'pro_docs_received',
  READY_FOR_REVIEW = 'ready_for_review',
  IN_PROGRESS = 'in_progress',
  QUALITY_CONTROL = 'quality_control',
  COMPLETED = 'completed',
  DISPUTE = 'dispute',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum Urgency {
  STANDARD = 'standard',
  PRIORITY = 'priority',
  EXPRESS = 'express',
}

export enum Priority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum Verdict {
  RECOMMENDED = 'recommended',
  WATCH = 'watch',
  RISK = 'risk',
}

@Entity('verifications')
@Index(['reference'], { unique: true })
@Index(['userId'])
@Index(['professionalId'])
@Index(['status'])
@Index(['assignedOperatorId'])
@Index(['slaDeadline'])
@Index(['createdAt'])
export class Verification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20, unique: true })
  reference: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId: string;

  @Column({ type: 'varchar', length: 30, default: VerificationStatus.PENDING_PAYMENT })
  status: VerificationStatus;

  @Column({ type: 'varchar', length: 10, default: Urgency.STANDARD })
  urgency: Urgency;

  @Column({ type: 'varchar', length: 10, default: Priority.NORMAL })
  priority: Priority;

  @Column({ name: 'client_type', length: 20, nullable: true })
  clientType: string | null;

  @Column({ name: 'quote_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  quoteAmount: number | null;

  @Column({ name: 'quote_date', type: 'date', nullable: true })
  quoteDate: Date | null;

  @Column({ name: 'work_type', length: 100, nullable: true })
  workType: string | null;

  @Column({ name: 'work_address', type: 'text', nullable: true })
  workAddress: string | null;

  @Column({ name: 'work_city', length: 100, nullable: true })
  workCity: string | null;

  @Column({ name: 'ocr_raw_data', type: 'jsonb', nullable: true })
  ocrRawData: Record<string, any> | null;

  @Column({ name: 'ocr_confidence', type: 'decimal', precision: 5, scale: 2, nullable: true })
  ocrConfidence: number | null;

  @Column({ name: 'ocr_provider', length: 50, nullable: true })
  ocrProvider: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  verdict: Verdict | null;

  @Column({ name: 'ai_observations', type: 'text', nullable: true })
  aiObservations: string | null;

  @Column({ name: 'operator_notes', type: 'text', nullable: true })
  operatorNotes: string | null;

  @Column({ name: 'report_pdf_url', type: 'text', nullable: true })
  reportPdfUrl: string | null;

  @Column({ name: 'report_web_token', length: 128, unique: true, nullable: true })
  reportWebToken: string | null;

  @Column({ name: 'report_generated_at', type: 'timestamptz', nullable: true })
  reportGeneratedAt: Date | null;

  @Column({ name: 'is_premium_verification', default: false })
  isPremiumVerification: boolean;

  @Column({ name: 'assigned_operator_id', type: 'uuid', nullable: true })
  assignedOperatorId: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assigned_operator_id' })
  assignedOperator: User;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  @Column({ name: 'sla_deadline', type: 'timestamptz', nullable: true })
  slaDeadline: Date | null;

  @Column({ name: 'time_to_first_open', type: 'int', nullable: true })
  timeToFirstOpen: number | null;

  @Column({ name: 'time_active_total', type: 'int', nullable: true })
  timeActiveTotal: number | null;

  @Column({ name: 'time_total_resolution', type: 'int', nullable: true })
  timeTotalResolution: number | null;

  @VersionColumn()
  version: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;

  // Computed
  get isActive(): boolean {
    return ![VerificationStatus.COMPLETED, VerificationStatus.CANCELLED, VerificationStatus.REFUNDED].includes(this.status);
  }

  get slaRemainingMs(): number | null {
    if (!this.slaDeadline) return null;
    return this.slaDeadline.getTime() - Date.now();
  }

  get isSlaBreached(): boolean {
    return this.slaRemainingMs !== null && this.slaRemainingMs <= 0;
  }
}
