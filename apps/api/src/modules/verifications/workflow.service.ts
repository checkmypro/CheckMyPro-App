import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Verification, VerificationStatus } from '@/database/entities/verification.entity';
import { CaseEvent } from '@/database/entities/business.entity';

// Allowed transitions map — single source of truth
const TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  [VerificationStatus.PENDING_PAYMENT]: [VerificationStatus.PAID, VerificationStatus.CANCELLED],
  [VerificationStatus.PAID]: [VerificationStatus.AI_ANALYSIS],
  [VerificationStatus.AI_ANALYSIS]: [VerificationStatus.AWAITING_PRO_DOCS, VerificationStatus.READY_FOR_REVIEW],
  [VerificationStatus.AWAITING_PRO_DOCS]: [VerificationStatus.PRO_DOCS_RECEIVED, VerificationStatus.READY_FOR_REVIEW],
  [VerificationStatus.PRO_DOCS_RECEIVED]: [VerificationStatus.READY_FOR_REVIEW],
  [VerificationStatus.READY_FOR_REVIEW]: [VerificationStatus.IN_PROGRESS],
  [VerificationStatus.IN_PROGRESS]: [VerificationStatus.QUALITY_CONTROL, VerificationStatus.COMPLETED],
  [VerificationStatus.QUALITY_CONTROL]: [VerificationStatus.COMPLETED, VerificationStatus.IN_PROGRESS],
  [VerificationStatus.COMPLETED]: [VerificationStatus.DISPUTE],
  [VerificationStatus.DISPUTE]: [VerificationStatus.IN_PROGRESS, VerificationStatus.COMPLETED],
  [VerificationStatus.CANCELLED]: [],
  [VerificationStatus.REFUNDED]: [],
};

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectRepository(Verification)
    private readonly verifRepo: Repository<Verification>,
    @InjectRepository(CaseEvent)
    private readonly eventsRepo: Repository<CaseEvent>,
  ) {}

  /**
   * Transition a verification to a new status.
   * Enforces the state machine, logs the event, returns updated entity.
   */
  async transition(
    verificationId: string,
    toStatus: VerificationStatus,
    actorId: string | null,
    actorRole: string | null,
    note?: string,
    metadata?: Record<string, any>,
  ): Promise<Verification> {
    const verif = await this.verifRepo.findOne({ where: { id: verificationId } });
    if (!verif) {
      throw new BadRequestException('Dossier introuvable');
    }

    const fromStatus = verif.status;
    const allowed = TRANSITIONS[fromStatus] || [];

    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(
        `Transition interdite: ${fromStatus} → ${toStatus}. ` +
        `Transitions autorisées: ${allowed.join(', ') || 'aucune'}`,
      );
    }

    // Update status
    verif.status = toStatus;

    // Auto-set timestamps based on transition
    const now = new Date();
    if (toStatus === VerificationStatus.PAID) {
      verif.startedAt = now;
    }
    if (toStatus === VerificationStatus.IN_PROGRESS && !verif.timeToFirstOpen) {
      verif.timeToFirstOpen = Math.floor((now.getTime() - verif.createdAt.getTime()) / 1000);
    }
    if (toStatus === VerificationStatus.COMPLETED) {
      verif.completedAt = now;
      verif.timeTotalResolution = Math.floor((now.getTime() - verif.createdAt.getTime()) / 1000);
    }

    // Save with optimistic locking (version field auto-increments)
    try {
      await this.verifRepo.save(verif);
    } catch (err: any) {
      if (err.name === 'OptimisticLockVersionMismatchError') {
        throw new BadRequestException(
          'Ce dossier a été modifié par un autre opérateur. Rechargez la page.',
        );
      }
      throw err;
    }

    // Log event
    const event = this.eventsRepo.create({
      verificationId,
      eventType: `status.${toStatus}`,
      actorId,
      actorRole,
      fromStatus,
      toStatus,
      note,
      metadata,
    });
    await this.eventsRepo.save(event);

    this.logger.log(
      `Workflow: ${verificationId} ${fromStatus} → ${toStatus} by ${actorId || 'system'}`,
    );

    return verif;
  }

  /**
   * Check if a transition is valid without executing it
   */
  canTransition(currentStatus: VerificationStatus, toStatus: VerificationStatus): boolean {
    return (TRANSITIONS[currentStatus] || []).includes(toStatus);
  }

  /**
   * Get all allowed next statuses
   */
  getAllowedTransitions(currentStatus: VerificationStatus): VerificationStatus[] {
    return TRANSITIONS[currentStatus] || [];
  }
}
