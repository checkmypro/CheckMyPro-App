import { Module, Injectable, Logger } from '@nestjs/common';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScoringRecord } from '@/database/entities/business.entity';
import { Verification, Verdict } from '@/database/entities/verification.entity';
import {
  ProAdminData, ProReputationData, ProDigitalData, AdminSituation,
} from '@/database/entities/professional.entity';

const ALGORITHM_VERSION = '1.0';

interface ScoringInput {
  adminData: ProAdminData | null;
  reputationData: ProReputationData[];
  digitalData: ProDigitalData | null;
  documentsProvided: boolean;
  insuranceValid: boolean;
  insurancePartial: boolean;
}

interface ScoringResult {
  scoreTotal: number;
  scoreDocuments: number;
  scoreInsurance: number;
  scoreSeniority: number;
  scoreMorality: number;
  scoreBonus: number;
  verdict: 'recommended' | 'watch' | 'risk';
  confidence: number;
  flags: string[];
  reasoning: string;
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    @InjectRepository(ScoringRecord) private readonly scoreRepo: Repository<ScoringRecord>,
    @InjectRepository(ProAdminData) private readonly adminRepo: Repository<ProAdminData>,
    @InjectRepository(ProReputationData) private readonly repRepo: Repository<ProReputationData>,
    @InjectRepository(ProDigitalData) private readonly digRepo: Repository<ProDigitalData>,
  ) {}

  /**
   * Calculate full score for a verification
   */
  async computeScore(
    verificationId: string,
    professionalId: string,
    options: {
      documentsProvided: boolean;
      insuranceValid: boolean;
      insurancePartial: boolean;
      bonusApplied?: boolean;
      operatorId?: string;
      computedBy?: 'ai' | 'operator' | 'system';
    },
  ): Promise<ScoringRecord> {
    // Gather all data
    const adminData = await this.adminRepo.findOne({
      where: { professionalId },
      order: { fetchedAt: 'DESC' },
    });

    const reputationData = await this.repRepo.find({
      where: { professionalId },
      order: { scrapedAt: 'DESC' },
    });

    const digitalData = await this.digRepo.findOne({
      where: { professionalId },
      order: { scannedAt: 'DESC' },
    });

    const input: ScoringInput = {
      adminData,
      reputationData,
      digitalData,
      documentsProvided: options.documentsProvided,
      insuranceValid: options.insuranceValid,
      insurancePartial: options.insurancePartial,
    };

    // Calculate
    const result = this.calculate(input);

    // Apply bonus
    if (options.bonusApplied) {
      result.scoreBonus = 0.5;
      result.scoreTotal = Math.min(result.scoreTotal + 0.5, 5.5);
    }

    // Create scoring record
    const record = this.scoreRepo.create({
      verificationId,
      computedBy: options.computedBy || 'ai',
      operatorId: options.operatorId || null,
      algorithmVersion: ALGORITHM_VERSION,
      scoreTotal: result.scoreTotal,
      scoreDocuments: result.scoreDocuments,
      scoreInsurance: result.scoreInsurance,
      scoreSeniority: result.scoreSeniority,
      scoreMorality: result.scoreMorality,
      scoreBonus: result.scoreBonus,
      verdict: result.verdict,
      confidence: result.confidence,
      flags: result.flags,
      reasoning: result.reasoning,
      inputSnapshot: {
        adminSituation: adminData?.situation,
        dateCreation: adminData?.dateCreation,
        reputationPlatforms: reputationData.length,
        avgRating: this.avgRating(reputationData),
        digitalScore: digitalData?.digitalScore,
        documentsProvided: options.documentsProvided,
        insuranceValid: options.insuranceValid,
      },
      isFinal: options.computedBy === 'operator',
    });

    await this.scoreRepo.save(record);
    this.logger.log(`Score computed for verification ${verificationId}: ${result.scoreTotal}/5 → ${result.verdict}`);

    return record;
  }

  /**
   * Core scoring algorithm
   */
  private calculate(input: ScoringInput): ScoringResult {
    const flags: string[] = [];
    let confidence = 100;

    // 1. Documents administratifs (/2)
    let scoreDocuments = 0;
    if (input.adminData) {
      if (input.adminData.situation === AdminSituation.ACTIVE && input.adminData.raisonSociale) {
        scoreDocuments = 2;
      } else if (input.adminData.situation === AdminSituation.UNKNOWN) {
        scoreDocuments = 1;
        confidence -= 15;
      } else {
        scoreDocuments = 0.5;
      }

      if (input.adminData.situation === AdminSituation.RADIEE) {
        flags.push('radiee');
      }
      if (input.adminData.situation === AdminSituation.LIQUIDATION) {
        flags.push('liquidation');
      }
    } else {
      scoreDocuments = 0;
      flags.push('no_admin_data');
      confidence -= 25;
    }

    // 2. Assurances (/1)
    let scoreInsurance = 0;
    if (input.insuranceValid) {
      scoreInsurance = 1;
    } else if (input.insurancePartial) {
      scoreInsurance = 0.5;
      flags.push('partial_insurance');
    } else {
      scoreInsurance = 0;
      if (!input.documentsProvided) {
        flags.push('no_docs');
      } else {
        flags.push('expired_insurance');
      }
    }

    // 3. Ancienneté (/1)
    let scoreSeniority = 0;
    if (input.adminData?.dateCreation) {
      const yearsOld = (Date.now() - new Date(input.adminData.dateCreation).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (yearsOld >= 3) {
        scoreSeniority = 1;
      } else if (yearsOld >= 1) {
        scoreSeniority = 0.5;
      } else {
        scoreSeniority = 0;
      }
    } else {
      confidence -= 10;
    }

    // 4. Moralité (/1)
    let scoreMorality = 0;
    if (input.reputationData.length > 0) {
      const avg = this.avgRating(input.reputationData);
      if (avg !== null) {
        if (avg >= 4.0) {
          scoreMorality = 1;
        } else if (avg >= 2.5) {
          scoreMorality = 0.5;
        } else {
          scoreMorality = 0;
          flags.push('low_reputation');
        }

        // Check for negative keywords
        const hasNegativeKeywords = input.reputationData.some(
          (r) => r.keywordsNegative && r.keywordsNegative.length > 3,
        );
        if (hasNegativeKeywords) {
          scoreMorality = Math.max(0, scoreMorality - 0.2);
          flags.push('negative_keywords');
        }
      }
    } else {
      scoreMorality = 0.3; // Unknown = neutral-low
      confidence -= 15;
    }

    // Digital footprint flags
    if (input.digitalData) {
      if (input.digitalData.digitalScore === 'none') {
        flags.push('no_digital_presence');
      }
      if (input.digitalData.photosSuspicious) {
        flags.push('suspicious_photos');
      }
    }

    // Total
    let scoreTotal = Math.round((scoreDocuments + scoreInsurance + scoreSeniority + scoreMorality) * 10) / 10;

    // Apply caps
    if (flags.includes('radiee')) {
      scoreTotal = Math.min(scoreTotal, 2.0); // RADIEE_CAP
    }
    if (flags.includes('liquidation')) {
      scoreTotal = Math.min(scoreTotal, 1.0); // LIQUIDATION_CAP
    }

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

    // Build reasoning
    const reasoning = this.buildReasoning(
      scoreDocuments, scoreInsurance, scoreSeniority, scoreMorality, flags, verdict,
    );

    return {
      scoreTotal,
      scoreDocuments,
      scoreInsurance,
      scoreSeniority,
      scoreMorality,
      scoreBonus: 0,
      verdict,
      confidence: Math.max(0, confidence),
      flags,
      reasoning,
    };
  }

  private avgRating(data: ProReputationData[]): number | null {
    const rated = data.filter((d) => d.averageRating !== null);
    if (rated.length === 0) return null;
    return rated.reduce((sum, d) => sum + Number(d.averageRating), 0) / rated.length;
  }

  private buildReasoning(
    docs: number, ins: number, sen: number, mor: number,
    flags: string[], verdict: string,
  ): string {
    const parts: string[] = [];

    if (docs >= 1.5) parts.push('Données administratives complètes et cohérentes.');
    else if (docs >= 0.5) parts.push('Données administratives partielles.');
    else parts.push('Données administratives introuvables ou incohérentes.');

    if (ins >= 1) parts.push('Assurance valide et couvrante.');
    else if (ins >= 0.5) parts.push('Assurance partielle ou doute léger.');
    else parts.push('Aucune assurance valide fournie.');

    if (sen >= 1) parts.push('Entreprise établie depuis plus de 3 ans.');
    else if (sen >= 0.5) parts.push('Entreprise récente (1-3 ans).');

    if (mor >= 0.8) parts.push('Bonne réputation en ligne.');
    else if (mor >= 0.4) parts.push('Réputation mitigée.');
    else if (mor > 0) parts.push('Réputation préoccupante.');

    if (flags.includes('radiee')) parts.push('⚠️ ENTREPRISE RADIÉE au registre du commerce.');
    if (flags.includes('liquidation')) parts.push('⚠️ ENTREPRISE EN LIQUIDATION.');
    if (flags.includes('no_docs')) parts.push('Le professionnel n\'a pas fourni ses documents malgré les relances.');
    if (flags.includes('no_digital_presence')) parts.push('Présence numérique faible ou inexistante.');
    if (flags.includes('suspicious_photos')) parts.push('Photos suspectes détectées.');

    return parts.join(' ');
  }

  /**
   * Get scoring history for a verification
   */
  async getHistory(verificationId: string): Promise<ScoringRecord[]> {
    return this.scoreRepo.find({
      where: { verificationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get final score
   */
  async getFinalScore(verificationId: string): Promise<ScoringRecord | null> {
    return this.scoreRepo.findOne({
      where: { verificationId, isFinal: true },
      order: { createdAt: 'DESC' },
    });
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([ScoringRecord, ProAdminData, ProReputationData, ProDigitalData]),
  ],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
