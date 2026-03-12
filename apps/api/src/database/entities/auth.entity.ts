import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'token_hash', length: 255 })
  tokenHash: string;

  @Column({ name: 'device_fingerprint', length: 255, nullable: true })
  deviceFingerprint: string | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  get isExpired(): boolean {
    return this.expiresAt < new Date();
  }

  get isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  get isValid(): boolean {
    return !this.isExpired && !this.isRevoked;
  }
}

@Entity('otp_codes')
@Index(['email', 'purpose'])
export class OtpCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  email: string;

  @Column({ name: 'code_hash', length: 255 })
  codeHash: string;

  @Column({ length: 20 })
  purpose: 'email_verify' | 'password_reset';

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', default: 3 })
  maxAttempts: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  get isExpired(): boolean {
    return this.expiresAt < new Date();
  }

  get isUsed(): boolean {
    return this.usedAt !== null;
  }

  get hasRemainingAttempts(): boolean {
    return this.attempts < this.maxAttempts;
  }
}

@Entity('audit_logs')
@Index(['actorId'])
@Index(['entityType', 'entityId'])
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_role', length: 20, nullable: true })
  actorRole: string | null;

  @Column({ length: 100 })
  action: string;

  @Column({ name: 'entity_type', length: 50, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue: Record<string, any> | null;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue: Record<string, any> | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
