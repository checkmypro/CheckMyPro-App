import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, Index, OneToMany,
} from 'typeorm';

export enum UserRole {
  USER = 'user',
  PRO = 'pro',
  OPERATOR = 'operator',
  OPERATOR_SENIOR = 'operator_senior',
  SUPERVISOR = 'supervisor',
  ADMIN = 'admin',
  AUDITOR = 'auditor',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export enum ClientType {
  B2C = 'b2c',
  B2B = 'b2b',
  COPRO = 'copro',
  HLM = 'hlm',
}

@Entity('users')
@Index(['email'], { unique: true })
@Index(['referralCode'], { unique: true, where: '"referral_code" IS NOT NULL' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ length: 100, nullable: true })
  city: string | null;

  @Column({ name: 'postal_code', length: 10, nullable: true })
  postalCode: string | null;

  @Column({ name: 'client_type', type: 'varchar', length: 20, default: ClientType.B2C })
  clientType: ClientType;

  @Column({ type: 'varchar', length: 20, default: UserRole.USER })
  role: UserRole;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ name: 'phone_verified', default: false })
  phoneVerified: boolean;

  @Column({ name: 'is_premium', default: false })
  isPremium: boolean;

  @Column({ name: 'premium_started_at', type: 'timestamptz', nullable: true })
  premiumStartedAt: Date | null;

  @Column({ name: 'premium_expires_at', type: 'timestamptz', nullable: true })
  premiumExpiresAt: Date | null;

  @Column({ name: 'stripe_customer_id', length: 255, nullable: true })
  stripeCustomerId: string | null;

  @Column({ name: 'xp_points', default: 0 })
  xpPoints: number;

  @Column({ name: 'total_secured', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalSecured: number;

  @Column({ name: 'referral_code', length: 20, nullable: true, unique: true })
  referralCode: string | null;

  @Column({ name: 'referred_by', type: 'uuid', nullable: true })
  referredBy: string | null;

  @Column({ name: 'totp_secret', length: 255, nullable: true })
  totpSecret: string | null;

  @Column({ type: 'varchar', length: 20, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ name: 'failed_login_count', default: 0 })
  failedLoginCount: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'login_count', default: 0 })
  loginCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;

  // Computed
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  get isStaff(): boolean {
    return [UserRole.OPERATOR, UserRole.OPERATOR_SENIOR, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR].includes(this.role);
  }

  get isLocked(): boolean {
    return this.lockedUntil !== null && this.lockedUntil > new Date();
  }
}
