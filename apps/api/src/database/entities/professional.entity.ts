import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, Index,
} from 'typeorm';

@Entity('professionals')
@Index(['city'])
export class Professional {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_name', length: 255 })
  companyName: string;

  @Column({ length: 14, nullable: true })
  siret: string | null;

  @Column({ length: 9, nullable: true })
  siren: string | null;

  @Column({ length: 255, nullable: true })
  email: string | null;

  @Column({ length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ length: 100, nullable: true })
  city: string | null;

  @Column({ name: 'postal_code', length: 10, nullable: true })
  postalCode: string | null;

  @Column({ name: 'trade_type', length: 100, nullable: true })
  tradeType: string | null;

  @Column({ name: 'registration_date', type: 'date', nullable: true })
  registrationDate: Date | null;

  @Column({ name: 'overall_score', type: 'decimal', precision: 3, scale: 1, nullable: true })
  overallScore: number | null;

  @Column({ name: 'total_verifications', default: 0 })
  totalVerifications: number;

  @Column({ name: 'last_verified_at', type: 'timestamptz', nullable: true })
  lastVerifiedAt: Date | null;

  @Column({ length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}

export enum AdminSituation {
  ACTIVE = 'active',
  RADIEE = 'radiee',
  LIQUIDATION = 'liquidation',
  UNKNOWN = 'unknown',
}

@Entity('pro_admin_data')
@Index(['professionalId'])
export class ProAdminData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId: string;

  @Column({ length: 14, nullable: true })
  siret: string | null;

  @Column({ length: 9, nullable: true })
  siren: string | null;

  @Column({ name: 'raison_sociale', length: 255, nullable: true })
  raisonSociale: string | null;

  @Column({ name: 'forme_juridique', length: 100, nullable: true })
  formeJuridique: string | null;

  @Column({ name: 'code_ape', length: 10, nullable: true })
  codeApe: string | null;

  @Column({ length: 255, nullable: true })
  dirigeant: string | null;

  @Column({ name: 'adresse_siege', type: 'text', nullable: true })
  adresseSiege: string | null;

  @Column({ name: 'date_creation', type: 'date', nullable: true })
  dateCreation: Date | null;

  @Column({ type: 'varchar', length: 30, default: AdminSituation.UNKNOWN })
  situation: AdminSituation;

  @Column({ name: 'capital_social', type: 'decimal', precision: 12, scale: 2, nullable: true })
  capitalSocial: number | null;

  @Column({ length: 50, nullable: true })
  effectif: string | null;

  @Column({ length: 50, default: 'sirene' })
  source: string;

  @Column({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData: Record<string, any> | null;

  @Column({ name: 'fetched_at', type: 'timestamptz', default: () => 'NOW()' })
  fetchedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('pro_reputation_data')
@Index(['professionalId'])
export class ProReputationData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId: string;

  @Column({ length: 50 })
  platform: string;

  @Column({ name: 'average_rating', type: 'decimal', precision: 3, scale: 1, nullable: true })
  averageRating: number | null;

  @Column({ name: 'total_reviews', default: 0 })
  totalReviews: number;

  @Column({ name: 'positive_count', default: 0 })
  positiveCount: number;

  @Column({ name: 'neutral_count', default: 0 })
  neutralCount: number;

  @Column({ name: 'negative_count', default: 0 })
  negativeCount: number;

  @Column({ name: 'keywords_positive', type: 'text', array: true, nullable: true })
  keywordsPositive: string[] | null;

  @Column({ name: 'keywords_negative', type: 'text', array: true, nullable: true })
  keywordsNegative: string[] | null;

  @Column({ name: 'sentiment_score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  sentimentScore: number | null;

  @Column({ name: 'profile_url', type: 'text', nullable: true })
  profileUrl: string | null;

  @Column({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData: Record<string, any> | null;

  @Column({ name: 'scraped_at', type: 'timestamptz', default: () => 'NOW()' })
  scrapedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('pro_digital_data')
@Index(['professionalId'])
export class ProDigitalData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId: string;

  @Column({ name: 'has_website', default: false })
  hasWebsite: boolean;

  @Column({ name: 'website_url', type: 'text', nullable: true })
  websiteUrl: string | null;

  @Column({ name: 'has_legal_notice', default: false })
  hasLegalNotice: boolean;

  @Column({ name: 'has_contact_page', default: false })
  hasContactPage: boolean;

  @Column({ name: 'social_urls', type: 'jsonb', nullable: true })
  socialUrls: Record<string, string> | null;

  @Column({ name: 'photos_suspicious', default: false })
  photosSuspicious: boolean;

  @Column({ name: 'digital_score', length: 20, nullable: true })
  digitalScore: 'strong' | 'moderate' | 'weak' | 'none' | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'scanned_at', type: 'timestamptz', default: () => 'NOW()' })
  scannedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('pro_invites')
export class ProInvite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId: string;

  @Column({ name: 'verification_id', type: 'uuid' })
  verificationId: string;

  @Column({ length: 128, unique: true })
  token: string;

  @Column({ length: 20, default: 'invited' })
  status: 'invited' | 'docs_partial' | 'docs_done' | 'expired';

  @Column({ name: 'max_uploads', default: 10 })
  maxUploads: number;

  @Column({ name: 'upload_count', default: 0 })
  uploadCount: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'first_accessed_at', type: 'timestamptz', nullable: true })
  firstAccessedAt: Date | null;

  @Column({ name: 'last_accessed_at', type: 'timestamptz', nullable: true })
  lastAccessedAt: Date | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  get isExpired(): boolean {
    return this.expiresAt < new Date();
  }
}
