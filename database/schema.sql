-- ============================================================
-- CHECKMYPRO — Database Schema v3.0
-- PostgreSQL 16+
-- Generated: March 2026
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255) UNIQUE NOT NULL,
  phone               VARCHAR(20),
  password_hash       VARCHAR(255) NOT NULL,
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  address             TEXT,
  city                VARCHAR(100),
  postal_code         VARCHAR(10),
  client_type         VARCHAR(20) DEFAULT 'b2c'
                        CHECK (client_type IN ('b2c','b2b','copro','hlm')),
  role                VARCHAR(20) DEFAULT 'user'
                        CHECK (role IN ('user','pro','operator','operator_senior','supervisor','admin','auditor')),
  email_verified      BOOLEAN DEFAULT FALSE,
  phone_verified      BOOLEAN DEFAULT FALSE,
  is_premium          BOOLEAN DEFAULT FALSE,
  premium_started_at  TIMESTAMP WITH TIME ZONE,
  premium_expires_at  TIMESTAMP WITH TIME ZONE,
  stripe_customer_id  VARCHAR(255),
  xp_points           INTEGER DEFAULT 0,
  total_secured       DECIMAL(12,2) DEFAULT 0,
  referral_code       VARCHAR(20) UNIQUE,
  referred_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  totp_secret         VARCHAR(255),
  status              VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN ('active','suspended','deleted')),
  failed_login_count  INTEGER DEFAULT 0,
  locked_until        TIMESTAMP WITH TIME ZONE,
  last_login_at       TIMESTAMP WITH TIME ZONE,
  login_count         INTEGER DEFAULT 0,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at          TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_referral ON users(referral_code) WHERE referral_code IS NOT NULL;

-- ============================================================
-- 2. PROFESSIONALS
-- ============================================================
CREATE TABLE professionals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name        VARCHAR(255) NOT NULL,
  siret               VARCHAR(14),
  siren               VARCHAR(9),
  email               VARCHAR(255),
  phone               VARCHAR(20),
  address             TEXT,
  city                VARCHAR(100),
  postal_code         VARCHAR(10),
  trade_type          VARCHAR(100),
  registration_date   DATE,
  overall_score       DECIMAL(3,1),
  total_verifications INTEGER DEFAULT 0,
  last_verified_at    TIMESTAMP WITH TIME ZONE,
  status              VARCHAR(20) DEFAULT 'active',
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at          TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX idx_pro_siret ON professionals(siret) WHERE siret IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_pro_company ON professionals(company_name);
CREATE INDEX idx_pro_city ON professionals(city);

-- ============================================================
-- 3. VERIFICATIONS (dossiers)
-- ============================================================
CREATE TABLE verifications (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference                 VARCHAR(20) UNIQUE NOT NULL,
  user_id                   UUID NOT NULL REFERENCES users(id),
  professional_id           UUID NOT NULL REFERENCES professionals(id),
  status                    VARCHAR(30) NOT NULL DEFAULT 'pending_payment'
                              CHECK (status IN (
                                'pending_payment','paid','ai_analysis','awaiting_pro_docs',
                                'pro_docs_received','ready_for_review','in_progress',
                                'quality_control','completed','dispute','cancelled','refunded'
                              )),
  urgency                   VARCHAR(10) DEFAULT 'standard'
                              CHECK (urgency IN ('standard','priority','express')),
  priority                  VARCHAR(10) DEFAULT 'normal'
                              CHECK (priority IN ('low','normal','high','urgent')),
  client_type               VARCHAR(20),
  quote_amount              DECIMAL(12,2),
  quote_date                DATE,
  work_type                 VARCHAR(100),
  work_address              TEXT,
  work_city                 VARCHAR(100),
  ocr_raw_data              JSONB,
  ocr_confidence            DECIMAL(5,2),
  ocr_provider              VARCHAR(50),
  verdict                   VARCHAR(20)
                              CHECK (verdict IN ('recommended','watch','risk')),
  ai_observations           TEXT,
  operator_notes            TEXT,
  report_pdf_url            TEXT,
  report_web_token          VARCHAR(128) UNIQUE,
  report_generated_at       TIMESTAMP WITH TIME ZONE,
  is_premium_verification   BOOLEAN DEFAULT FALSE,
  assigned_operator_id      UUID REFERENCES users(id),
  assigned_at               TIMESTAMP WITH TIME ZONE,
  sla_deadline              TIMESTAMP WITH TIME ZONE,
  time_to_first_open        INTEGER,
  time_active_total         INTEGER,
  time_total_resolution     INTEGER,
  version                   INTEGER DEFAULT 1,
  started_at                TIMESTAMP WITH TIME ZONE,
  completed_at              TIMESTAMP WITH TIME ZONE,
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at                TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_verif_reference ON verifications(reference);
CREATE INDEX idx_verif_user ON verifications(user_id);
CREATE INDEX idx_verif_pro ON verifications(professional_id);
CREATE INDEX idx_verif_status ON verifications(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_verif_operator ON verifications(assigned_operator_id) WHERE assigned_operator_id IS NOT NULL;
CREATE INDEX idx_verif_sla ON verifications(sla_deadline) WHERE status NOT IN ('completed','cancelled','refunded');
CREATE INDEX idx_verif_created ON verifications(created_at DESC);

-- ============================================================
-- 4. SCORING_RECORDS
-- ============================================================
CREATE TABLE scoring_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id     UUID NOT NULL REFERENCES verifications(id),
  computed_by         VARCHAR(20) NOT NULL
                        CHECK (computed_by IN ('ai','operator','system')),
  operator_id         UUID REFERENCES users(id),
  algorithm_version   VARCHAR(10) NOT NULL DEFAULT '1.0',
  score_total         DECIMAL(3,1) NOT NULL,
  score_documents     DECIMAL(3,1) NOT NULL,
  score_insurance     DECIMAL(3,1) NOT NULL,
  score_seniority     DECIMAL(3,1) NOT NULL,
  score_morality      DECIMAL(3,1) NOT NULL,
  score_bonus         DECIMAL(3,1) DEFAULT 0,
  verdict             VARCHAR(20) NOT NULL
                        CHECK (verdict IN ('recommended','watch','risk')),
  confidence          DECIMAL(5,2),
  flags               TEXT[],
  reasoning           TEXT,
  input_snapshot      JSONB,
  is_final            BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_score_verif ON scoring_records(verification_id);
CREATE INDEX idx_score_final ON scoring_records(verification_id, is_final) WHERE is_final = TRUE;

-- ============================================================
-- 5. DOCUMENTS
-- ============================================================
CREATE TABLE documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id     UUID REFERENCES verifications(id),
  professional_id     UUID REFERENCES professionals(id),
  uploaded_by         VARCHAR(20) NOT NULL
                        CHECK (uploaded_by IN ('client','pro','operator','system')),
  uploader_id         UUID,
  type                VARCHAR(50) NOT NULL
                        CHECK (type IN ('kbis','urssaf','insurance_rc','insurance_decennial',
                                        'certification','quote','identity','other','unknown')),
  original_filename   VARCHAR(255),
  storage_key         VARCHAR(512) NOT NULL,
  file_size           INTEGER,
  mime_type           VARCHAR(100),
  checksum_sha256     VARCHAR(64),
  status              VARCHAR(20) DEFAULT 'pending'
                        CHECK (status IN ('pending','analyzing','valid','invalid','expired',
                                          'rejected','superseded')),
  expires_at          DATE,
  validated_by        UUID REFERENCES users(id),
  validated_at        TIMESTAMP WITH TIME ZONE,
  rejection_reason    TEXT,
  ai_detected_type    VARCHAR(50),
  ai_metadata         JSONB,
  ai_confidence       DECIMAL(5,2),
  version             INTEGER DEFAULT 1,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at          TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_doc_verif ON documents(verification_id);
CREATE INDEX idx_doc_pro ON documents(professional_id);
CREATE INDEX idx_doc_type ON documents(type);
CREATE INDEX idx_doc_checksum ON documents(checksum_sha256) WHERE checksum_sha256 IS NOT NULL;

-- ============================================================
-- 6. PRO_ADMIN_DATA
-- ============================================================
CREATE TABLE pro_admin_data (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     UUID NOT NULL REFERENCES professionals(id),
  siret               VARCHAR(14),
  siren               VARCHAR(9),
  raison_sociale      VARCHAR(255),
  forme_juridique     VARCHAR(100),
  code_ape            VARCHAR(10),
  dirigeant           VARCHAR(255),
  adresse_siege       TEXT,
  date_creation       DATE,
  situation           VARCHAR(30)
                        CHECK (situation IN ('active','radiee','liquidation','unknown')),
  capital_social      DECIMAL(12,2),
  effectif            VARCHAR(50),
  source              VARCHAR(50) DEFAULT 'sirene',
  raw_data            JSONB,
  fetched_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at          TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pad_pro ON pro_admin_data(professional_id);

-- ============================================================
-- 7. PRO_REPUTATION_DATA
-- ============================================================
CREATE TABLE pro_reputation_data (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     UUID NOT NULL REFERENCES professionals(id),
  platform            VARCHAR(50) NOT NULL,
  average_rating      DECIMAL(3,1),
  total_reviews       INTEGER DEFAULT 0,
  positive_count      INTEGER DEFAULT 0,
  neutral_count       INTEGER DEFAULT 0,
  negative_count      INTEGER DEFAULT 0,
  keywords_positive   TEXT[],
  keywords_negative   TEXT[],
  sentiment_score     DECIMAL(5,2),
  profile_url         TEXT,
  raw_data            JSONB,
  scraped_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_prd_pro ON pro_reputation_data(professional_id);

-- ============================================================
-- 8. PRO_DIGITAL_DATA
-- ============================================================
CREATE TABLE pro_digital_data (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     UUID NOT NULL REFERENCES professionals(id),
  has_website         BOOLEAN DEFAULT FALSE,
  website_url         TEXT,
  has_legal_notice    BOOLEAN DEFAULT FALSE,
  has_contact_page    BOOLEAN DEFAULT FALSE,
  social_urls         JSONB,
  photos_suspicious   BOOLEAN DEFAULT FALSE,
  digital_score       VARCHAR(20)
                        CHECK (digital_score IN ('strong','moderate','weak','none')),
  notes               TEXT,
  scanned_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pdd_pro ON pro_digital_data(professional_id);

-- ============================================================
-- 9. PRO_INVITES
-- ============================================================
CREATE TABLE pro_invites (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     UUID NOT NULL REFERENCES professionals(id),
  verification_id     UUID NOT NULL REFERENCES verifications(id),
  token               VARCHAR(128) UNIQUE NOT NULL,
  status              VARCHAR(20) DEFAULT 'invited'
                        CHECK (status IN ('invited','docs_partial','docs_done','expired')),
  max_uploads         INTEGER DEFAULT 10,
  upload_count        INTEGER DEFAULT 0,
  expires_at          TIMESTAMP WITH TIME ZONE NOT NULL,
  first_accessed_at   TIMESTAMP WITH TIME ZONE,
  last_accessed_at    TIMESTAMP WITH TIME ZONE,
  ip_address          INET,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_pi_token ON pro_invites(token);

-- ============================================================
-- 10. PAYMENTS
-- ============================================================
CREATE TABLE payments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id),
  verification_id         UUID REFERENCES verifications(id),
  stripe_payment_id       VARCHAR(255) UNIQUE,
  stripe_subscription_id  VARCHAR(255),
  amount                  DECIMAL(10,2) NOT NULL,
  currency                VARCHAR(3) DEFAULT 'EUR',
  type                    VARCHAR(20) NOT NULL
                            CHECK (type IN ('one_time','subscription','refund')),
  status                  VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','processing','completed','failed','refunded','cancelled')),
  payment_method          VARCHAR(30),
  receipt_url             TEXT,
  refund_reason           TEXT,
  refunded_by             UUID REFERENCES users(id),
  metadata                JSONB,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pay_user ON payments(user_id);
CREATE INDEX idx_pay_stripe ON payments(stripe_payment_id) WHERE stripe_payment_id IS NOT NULL;
CREATE INDEX idx_pay_status ON payments(status);

-- ============================================================
-- 11. WEBHOOK_EVENTS
-- ============================================================
CREATE TABLE webhook_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            VARCHAR(30) NOT NULL,
  external_event_id   VARCHAR(255) NOT NULL,
  event_type          VARCHAR(100) NOT NULL,
  payload             JSONB,
  processed           BOOLEAN DEFAULT FALSE,
  processed_at        TIMESTAMP WITH TIME ZONE,
  error               TEXT,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider, external_event_id)
);

CREATE INDEX idx_wh_provider ON webhook_events(provider, external_event_id);

-- ============================================================
-- 12. AI_JOBS
-- ============================================================
CREATE TABLE ai_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id     UUID REFERENCES verifications(id),
  professional_id     UUID REFERENCES professionals(id),
  job_type            VARCHAR(50) NOT NULL
                        CHECK (job_type IN ('admin_check','reputation_scan','digital_scan',
                                            'document_ocr','document_analysis','scoring',
                                            'report_generation','pro_contact','pro_reminder')),
  status              VARCHAR(20) NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','running','completed','failed','cancelled')),
  provider            VARCHAR(50),
  model_version       VARCHAR(50),
  input_data          JSONB,
  output_data         JSONB,
  error_message       TEXT,
  retry_count         INTEGER DEFAULT 0,
  max_retries         INTEGER DEFAULT 3,
  duration_ms         INTEGER,
  cost_cents          INTEGER,
  started_at          TIMESTAMP WITH TIME ZONE,
  completed_at        TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_aij_verif ON ai_jobs(verification_id);
CREATE INDEX idx_aij_status ON ai_jobs(status);
CREATE INDEX idx_aij_type ON ai_jobs(job_type);
CREATE INDEX idx_aij_created ON ai_jobs(created_at DESC);

-- ============================================================
-- 13. CASE_EVENTS
-- ============================================================
CREATE TABLE case_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id     UUID NOT NULL REFERENCES verifications(id),
  event_type          VARCHAR(50) NOT NULL,
  actor_id            UUID REFERENCES users(id),
  actor_role          VARCHAR(20),
  from_status         VARCHAR(30),
  to_status           VARCHAR(30),
  metadata            JSONB,
  note                TEXT,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ce_verif ON case_events(verification_id);
CREATE INDEX idx_ce_created ON case_events(created_at DESC);

-- ============================================================
-- 14. PRO_COMMUNICATIONS
-- ============================================================
CREATE TABLE pro_communications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id     UUID NOT NULL REFERENCES verifications(id),
  professional_id     UUID NOT NULL REFERENCES professionals(id),
  channel             VARCHAR(10) NOT NULL CHECK (channel IN ('sms','email')),
  type                VARCHAR(30) NOT NULL,
  template_id         UUID,
  content_snapshot    TEXT,
  external_id         VARCHAR(255),
  status              VARCHAR(20) DEFAULT 'queued'
                        CHECK (status IN ('queued','sent','delivered','failed','bounced')),
  sent_at             TIMESTAMP WITH TIME ZONE,
  delivered_at        TIMESTAMP WITH TIME ZONE,
  failed_at           TIMESTAMP WITH TIME ZONE,
  error_message       TEXT,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_procom_verif ON pro_communications(verification_id);

-- ============================================================
-- 15. MESSAGE_TEMPLATES
-- ============================================================
CREATE TABLE message_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(100) NOT NULL,
  channel             VARCHAR(10) NOT NULL CHECK (channel IN ('sms','email')),
  subject             VARCHAR(255),
  body                TEXT NOT NULL,
  variables           TEXT[],
  version             INTEGER DEFAULT 1,
  is_active           BOOLEAN DEFAULT TRUE,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 16. NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  verification_id     UUID REFERENCES verifications(id),
  type                VARCHAR(30) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  body                TEXT NOT NULL,
  channel             VARCHAR(20) NOT NULL
                        CHECK (channel IN ('push','email','sms','in_app')),
  is_read             BOOLEAN DEFAULT FALSE,
  sent_at             TIMESTAMP WITH TIME ZONE,
  read_at             TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notif_user ON notifications(user_id);
CREATE INDEX idx_notif_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- ============================================================
-- 17. NOTIFICATION_PREFERENCES
-- ============================================================
CREATE TABLE notification_preferences (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) UNIQUE,
  push_enabled        BOOLEAN DEFAULT TRUE,
  email_enabled       BOOLEAN DEFAULT TRUE,
  sms_enabled         BOOLEAN DEFAULT FALSE,
  report_ready        BOOLEAN DEFAULT TRUE,
  status_updates      BOOLEAN DEFAULT TRUE,
  badges              BOOLEAN DEFAULT TRUE,
  promotions          BOOLEAN DEFAULT FALSE,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 18. BADGES
-- ============================================================
CREATE TABLE badges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  badge_type          VARCHAR(50) NOT NULL,
  earned_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, badge_type)
);

-- ============================================================
-- 19. AUDIT_LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id            UUID REFERENCES users(id),
  actor_role          VARCHAR(20),
  action              VARCHAR(100) NOT NULL,
  entity_type         VARCHAR(50),
  entity_id           UUID,
  old_value           JSONB,
  new_value           JSONB,
  ip_address          INET,
  user_agent          TEXT,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ============================================================
-- 20. SYSTEM_CONFIG
-- ============================================================
CREATE TABLE system_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 VARCHAR(100) UNIQUE NOT NULL,
  value               JSONB NOT NULL,
  description         TEXT,
  updated_by          UUID REFERENCES users(id),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 21. REFRESH_TOKENS
-- ============================================================
CREATE TABLE refresh_tokens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash          VARCHAR(255) NOT NULL,
  device_fingerprint  VARCHAR(255),
  ip_address          INET,
  expires_at          TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at          TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rt_user ON refresh_tokens(user_id);
CREATE INDEX idx_rt_hash ON refresh_tokens(token_hash);

-- ============================================================
-- 22. OTP_CODES
-- ============================================================
CREATE TABLE otp_codes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255) NOT NULL,
  code_hash           VARCHAR(255) NOT NULL,
  purpose             VARCHAR(20) NOT NULL CHECK (purpose IN ('email_verify','password_reset')),
  attempts            INTEGER DEFAULT 0,
  max_attempts        INTEGER DEFAULT 3,
  expires_at          TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at             TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_otp_email ON otp_codes(email, purpose);

-- ============================================================
-- SEED: Default system config
-- ============================================================
INSERT INTO system_config (key, value, description) VALUES
  ('sla.standard', '{"hours": 48}', 'SLA standard en heures'),
  ('sla.priority', '{"hours": 24}', 'SLA prioritaire en heures'),
  ('sla.express', '{"hours": 4}', 'SLA express en heures'),
  ('scoring.algorithm_version', '"1.0"', 'Version algorithme scoring'),
  ('scoring.radiee_cap', '{"max_score": 2.0}', 'Score max si entreprise radiée'),
  ('scoring.liquidation_cap', '{"max_score": 1.0}', 'Score max si en liquidation'),
  ('pro_contact.reminder_days', '[2, 5]', 'Jours de relance pro'),
  ('pro_contact.close_after_days', '7', 'Clôturer sans docs après X jours'),
  ('qc.auto_threshold_amount', '50000', 'Montant seuil pour QC automatique'),
  ('qc.auto_threshold_score', '2.5', 'Score seuil pour QC automatique');

-- ============================================================
-- FUNCTION: Auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pro_updated BEFORE UPDATE ON professionals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_verif_updated BEFORE UPDATE ON verifications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_doc_updated BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pay_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
