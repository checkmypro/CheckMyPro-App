import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Verification, VerificationStatus, Verdict } from '@entities/verification.entity';
import { ProAdminData, ProReputationData, ProDigitalData, AdminSituation } from '@entities/professional.entity';
import { ScoringRecord, AiJob, CaseEvent, Document } from '@entities/business.entity';

const ALGORITHM_VERSION = '1.0';
const RADIEE_CAP = 2.0;
const LIQUIDATION_CAP = 1.0;

interface ScoringPayload {
  verificationId: string;
  professionalId: string;
}

@Processor('scoring')
export class ScoringProcessor {
  private readonly logger = new Logger(ScoringProcessor.name);

  constructor(
    @InjectRepository(Verification) private readonly verifRepo: Repository<Verification>,
    @InjectRepository(ProAdminData) private readonly adminRepo: Repository<ProAdminData>,
    @InjectRepository(ProReputationData) private readonly repRepo: Repository<ProReputationData>,
    @InjectRepository(ProDigitalData) private readonly digRepo: Repository<ProDigitalData>,
    @InjectRepository(Document) private readonly docRepo: Repository<Document>,
    @InjectRepository(ScoringRecord) private readonly scoreRepo: Repository<ScoringRecord>,
    @InjectRepository(AiJob) private readonly jobRepo: Repository<AiJob>,
    @InjectRepository(CaseEvent) private readonly eventRepo: Repository<CaseEvent>,
  ) {}

  @Process({ concurrency: 10 })
  async handle(job: Job<ScoringPayload>) {
    const { verificationId, professionalId } = job.data;
    const start = Date.now();

    this.logger.log(`Scoring started: verification=${verificationId}`);

    const aiJob = this.jobRepo.create({
      verificationId, professionalId, jobType: 'scoring',
      status: 'running', provider: 'internal', startedAt: new Date(),
    });
    await this.jobRepo.save(aiJob);

    try {
      // Gather data
      const admin = await this.adminRepo.findOne({
        where: { professionalId }, order: { fetchedAt: 'DESC' },
      });
      const reputation = await this.repRepo.find({
        where: { professionalId }, order: { scrapedAt: 'DESC' },
      });
      const digital = await this.digRepo.findOne({
        where: { professionalId }, order: { scannedAt: 'DESC' },
      });
      const docs = await this.docRepo.find({
        where: { verificationId, status: 'valid' },
      });

      const hasInsurance = docs.some((d) =>
        ['insurance_rc', 'insurance_decennial'].includes(d.type) && d.status === 'valid',
      );
      const hasPartialInsurance = docs.some((d) =>
        ['insurance_rc', 'insurance_decennial'].includes(d.type),
      );
      const hasAnyDocs = docs.length > 0;

      // ── SCORING ALGORITHM ──
      const flags: string[] = [];

      // 1. Documents (/2)
      let scoreDocuments = 0;
      if (admin && admin.situation === AdminSituation.ACTIVE && admin.raisonSociale) {
        scoreDocuments = 2;
      } else if (admin && admin.situation === AdminSituation.UNKNOWN) {
        scoreDocuments = 1;
      } else if (admin) {
        scoreDocuments = 0.5;
      }
      if (admin?.situation === AdminSituation.RADIEE) flags.push('radiee');
      if (admin?.situation === AdminSituation.LIQUIDATION) flags.push('liquidation');
      if (!admin) flags.push('no_admin_data');

      // 2. Assurance (/1)
      let scoreInsurance = 0;
      if (hasInsurance) {
        scoreInsurance = 1;
      } else if (hasPartialInsurance) {
        scoreInsurance = 0.5;
        flags.push('partial_insurance');
      } else {
        if (!hasAnyDocs) flags.push('no_docs');
        else flags.push('expired_insurance');
      }

      // 3. Ancienneté (/1)
      let scoreSeniority = 0;
      if (admin?.dateCreation) {
        const years = (Date.now() - new Date(admin.dateCreation).getTime()) / (365.25 * 24 * 3600000);
        scoreSeniority = years >= 3 ? 1 : years >= 1 ? 0.5 : 0;
      }

      // 4. Moralité (/1)
      let scoreMorality = 0;
      if (reputation.length > 0) {
        const rated = reputation.filter((r) => r.averageRating !== null);
        const avg = rated.length > 0
          ? rated.reduce((s, r) => s + Number(r.averageRating), 0) / rated.length
          : null;

        if (avg !== null) {
          scoreMorality = avg >= 4.0 ? 1 : avg >= 2.5 ? 0.5 : 0;
          if (avg < 2.5) flags.push('low_reputation');
        }
      } else {
        scoreMorality = 0.3;
      }

      // Digital flags
      if (digital?.digitalScore === 'none') flags.push('no_digital_presence');
      if (digital?.photosSuspicious) flags.push('suspicious_photos');

      // Total + caps
      let scoreTotal = Math.round((scoreDocuments + scoreInsurance + scoreSeniority + scoreMorality) * 10) / 10;

      if (flags.includes('radiee')) scoreTotal = Math.min(scoreTotal, RADIEE_CAP);
      if (flags.includes('liquidation')) scoreTotal = Math.min(scoreTotal, LIQUIDATION_CAP);

      // Verdict
      let verdict: 'recommended' | 'watch' | 'risk';
      if (flags.includes('radiee') || flags.includes('liquidation')) {
        verdict = scoreTotal >= 2.0 ? 'watch' : 'risk';
      } else if (scoreTotal >= 4.0) {
        verdict = 'recommended';
      } else if (scoreTotal >= 2.5) {
        verdict = 'watch';
      } else {
        verdict = 'risk';
      }

      // Save scoring record
      const record = this.scoreRepo.create({
        verificationId, computedBy: 'ai', algorithmVersion: ALGORITHM_VERSION,
        scoreTotal, scoreDocuments, scoreInsurance, scoreSeniority, scoreMorality,
        scoreBonus: 0, verdict, confidence: 85,
        flags, reasoning: this.buildReasoning(flags, verdict, scoreTotal),
        inputSnapshot: {
          adminSituation: admin?.situation, dateCreation: admin?.dateCreation,
          reputationCount: reputation.length, docsCount: docs.length,
          hasInsurance, digitalScore: digital?.digitalScore,
        },
        isFinal: false, // operator must validate
      });
      await this.scoreRepo.save(record);

      // Update verification
      await this.verifRepo.update(verificationId, { verdict: verdict as Verdict });

      // Update AI job
      const duration = Date.now() - start;
      await this.jobRepo.update(aiJob.id, {
        status: 'completed', durationMs: duration, completedAt: new Date(),
        outputData: { scoreTotal, verdict, flags },
      });

      // Log event
      await this.eventRepo.save(this.eventRepo.create({
        verificationId, eventType: 'scoring_completed',
        metadata: { scoreTotal, verdict, flags, algorithmVersion: ALGORITHM_VERSION },
      }));

      this.logger.log(`Scoring done: ${verificationId} → ${scoreTotal}/5 (${verdict}) [${duration}ms]`);

    } catch (error) {
      await this.jobRepo.update(aiJob.id, {
        status: 'failed', errorMessage: error.message,
        durationMs: Date.now() - start, completedAt: new Date(),
      });
      this.logger.error(`Scoring failed: ${verificationId}`, error.stack);
      throw error;
    }
  }

  private buildReasoning(flags: string[], verdict: string, score: number): string {
    const parts: string[] = [`Score global : ${score}/5. Verdict : ${verdict}.`];
    if (flags.includes('radiee')) parts.push('⚠️ Entreprise radiée — score plafonné.');
    if (flags.includes('no_docs')) parts.push('Pro n\'a pas fourni de documents.');
    if (flags.includes('low_reputation')) parts.push('Réputation en ligne préoccupante.');
    if (flags.includes('no_digital_presence')) parts.push('Présence numérique faible.');
    return parts.join(' ');
  }
}
