import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull, LessThan } from 'typeorm';
import { Verification, VerificationStatus } from '@entities/verification.entity';
import { CaseEvent, Notification } from '@entities/business.entity';
import { User, UserRole } from '@entities/user.entity';

const ACTIVE_STATUSES = [
  VerificationStatus.AI_ANALYSIS,
  VerificationStatus.AWAITING_PRO_DOCS,
  VerificationStatus.PRO_DOCS_RECEIVED,
  VerificationStatus.READY_FOR_REVIEW,
  VerificationStatus.IN_PROGRESS,
  VerificationStatus.QUALITY_CONTROL,
];

@Processor('sla-check')
export class SlaCheckProcessor {
  private readonly logger = new Logger(SlaCheckProcessor.name);

  constructor(
    @InjectRepository(Verification) private readonly verifRepo: Repository<Verification>,
    @InjectRepository(CaseEvent) private readonly eventRepo: Repository<CaseEvent>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  @Process()
  async handle(job: Job) {
    const verifications = await this.verifRepo.find({
      where: {
        status: In(ACTIVE_STATUSES),
        slaDeadline: Not(IsNull()),
      },
    });

    let alerts75 = 0;
    let alerts90 = 0;
    let breached = 0;

    for (const v of verifications) {
      if (!v.slaDeadline) continue;

      const total = v.slaDeadline.getTime() - v.createdAt.getTime();
      const elapsed = Date.now() - v.createdAt.getTime();
      const pct = (elapsed / total) * 100;

      if (pct >= 100) {
        // BREACHED
        breached++;
        await this.createAlert(v, 'sla_breached', `SLA dépassé : ${v.reference}`);
      } else if (pct >= 90) {
        alerts90++;
        await this.createAlert(v, 'sla_90pct', `SLA à 90% : ${v.reference} — intervention urgente requise`);
      } else if (pct >= 75) {
        alerts75++;
        await this.createAlert(v, 'sla_75pct', `SLA à 75% : ${v.reference}`);
      }
    }

    if (breached > 0 || alerts90 > 0) {
      this.logger.warn(`SLA Check: ${breached} breached, ${alerts90} at 90%, ${alerts75} at 75%`);
    }

    return { checked: verifications.length, breached, alerts90, alerts75 };
  }

  private async createAlert(v: Verification, type: string, message: string) {
    // Check if we already sent this alert (avoid spam)
    const recentAlert = await this.eventRepo.findOne({
      where: {
        verificationId: v.id,
        eventType: type,
      },
      order: { createdAt: 'DESC' },
    });

    // Don't send the same alert more than once per hour
    if (recentAlert && (Date.now() - recentAlert.createdAt.getTime()) < 3600000) {
      return;
    }

    // Log event
    await this.eventRepo.save(this.eventRepo.create({
      verificationId: v.id,
      eventType: type,
      metadata: { slaDeadline: v.slaDeadline, urgency: v.urgency },
    }));

    // Notify supervisor(s) and admin(s) for breaches
    if (type === 'sla_breached' || type === 'sla_90pct') {
      const supervisors = await this.userRepo.find({
        where: { role: In([UserRole.SUPERVISOR, UserRole.ADMIN]), status: 'active' },
      });

      for (const sup of supervisors) {
        await this.notifRepo.save(this.notifRepo.create({
          userId: sup.id,
          verificationId: v.id,
          type: 'sla_alert',
          title: type === 'sla_breached' ? '🔴 SLA Dépassé' : '🟠 SLA Critique',
          body: message,
          channel: 'in_app',
        }));
      }
    }

    // Notify assigned operator
    if (v.assignedOperatorId) {
      await this.notifRepo.save(this.notifRepo.create({
        userId: v.assignedOperatorId,
        verificationId: v.id,
        type: 'sla_alert',
        title: 'Alerte SLA',
        body: message,
        channel: 'in_app',
      }));
    }
  }
}
