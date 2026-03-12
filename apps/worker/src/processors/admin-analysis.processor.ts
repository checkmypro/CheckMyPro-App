import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProAdminData, AdminSituation } from '@entities/professional.entity';
import { AiJob } from '@entities/business.entity';
import { Verification, VerificationStatus } from '@entities/verification.entity';
import { CaseEvent } from '@entities/business.entity';

interface AdminAnalysisPayload {
  verificationId: string;
  professionalId: string;
  siret?: string;
  companyName?: string;
  city?: string;
}

@Processor('admin-analysis')
export class AdminAnalysisProcessor {
  private readonly logger = new Logger(AdminAnalysisProcessor.name);

  constructor(
    @InjectRepository(ProAdminData) private readonly adminRepo: Repository<ProAdminData>,
    @InjectRepository(AiJob) private readonly jobRepo: Repository<AiJob>,
    @InjectRepository(Verification) private readonly verifRepo: Repository<Verification>,
    @InjectRepository(CaseEvent) private readonly eventRepo: Repository<CaseEvent>,
  ) {}

  @Process({ concurrency: 5 })
  async handle(job: Job<AdminAnalysisPayload>) {
    const { verificationId, professionalId, siret, companyName, city } = job.data;
    const startTime = Date.now();

    this.logger.log(`Admin analysis started: pro=${professionalId} siret=${siret || 'N/A'}`);

    // Create AI job record
    const aiJob = this.jobRepo.create({
      verificationId,
      professionalId,
      jobType: 'admin_check',
      status: 'running',
      provider: 'sirene_api',
      inputData: { siret, companyName, city },
      startedAt: new Date(),
    });
    await this.jobRepo.save(aiJob);

    try {
      // ── SIRENE API CALL ──
      // In production: const response = await fetch(`https://api.sirene.fr/...`)
      // For now: simulate API response
      const sireneData = await this.callSireneApi(siret, companyName, city);

      // Store result
      const adminData = this.adminRepo.create({
        professionalId,
        siret: sireneData.siret,
        siren: sireneData.siren,
        raisonSociale: sireneData.raisonSociale,
        formeJuridique: sireneData.formeJuridique,
        codeApe: sireneData.codeApe,
        dirigeant: sireneData.dirigeant,
        adresseSiege: sireneData.adresseSiege,
        dateCreation: sireneData.dateCreation ? new Date(sireneData.dateCreation) : null,
        situation: sireneData.situation as AdminSituation,
        capitalSocial: sireneData.capitalSocial,
        effectif: sireneData.effectif,
        rawData: sireneData,
        expiresAt: new Date(Date.now() + 90 * 24 * 3600000), // 90 days
      });
      await this.adminRepo.save(adminData);

      // Update AI job
      const duration = Date.now() - startTime;
      await this.jobRepo.update(aiJob.id, {
        status: 'completed',
        outputData: { situation: sireneData.situation, raisonSociale: sireneData.raisonSociale },
        durationMs: duration,
        completedAt: new Date(),
        costCents: 0, // SIRENE API is free
      });

      // Log event
      await this.eventRepo.save(this.eventRepo.create({
        verificationId,
        eventType: 'ai_admin_completed',
        metadata: { situation: sireneData.situation, duration },
      }));

      this.logger.log(`Admin analysis completed: pro=${professionalId} situation=${sireneData.situation} (${duration}ms)`);

    } catch (error) {
      const duration = Date.now() - startTime;
      await this.jobRepo.update(aiJob.id, {
        status: 'failed',
        errorMessage: error.message,
        durationMs: duration,
        completedAt: new Date(),
      });

      this.logger.error(`Admin analysis failed: pro=${professionalId}`, error.stack);
      throw error; // Bull will retry based on job options
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
    );

    // After max retries, mark as failed with unknown situation
    if (job.attemptsMade >= (job.opts?.attempts || 3)) {
      const { professionalId, verificationId } = job.data;
      const adminData = this.adminRepo.create({
        professionalId,
        situation: AdminSituation.UNKNOWN,
        source: 'fallback',
        rawData: { error: error.message, fallback: true },
      });
      await this.adminRepo.save(adminData);

      this.logger.warn(`Fallback: pro=${professionalId} marked as UNKNOWN after ${job.attemptsMade} failures`);
    }
  }

  /**
   * Call SIRENE/INSEE API — production implementation
   * Simulated for development
   */
  private async callSireneApi(siret?: string, companyName?: string, city?: string) {
    // In production:
    // const url = siret
    //   ? `https://api.insee.fr/entreprises/sirene/V3/siret/${siret}`
    //   : `https://api.insee.fr/entreprises/sirene/V3/siret?q=denominationUniteLegale:"${companyName}"`;
    // const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    // Development simulation
    return {
      siret: siret || '82345678900012',
      siren: siret?.substring(0, 9) || '823456789',
      raisonSociale: companyName || 'Entreprise Simulée SARL',
      formeJuridique: 'SARL',
      codeApe: '4399C',
      dirigeant: 'M. Exemple Dirigeant',
      adresseSiege: `${city || 'Aix-en-Provence'}`,
      dateCreation: '2019-06-15',
      situation: 'active',
      capitalSocial: 10000,
      effectif: '1-5',
    };
  }
}
