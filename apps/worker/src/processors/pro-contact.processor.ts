import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { ProInvite } from '@entities/professional.entity';
import { AiJob, CaseEvent, ProCommunication } from '@entities/business.entity';
import { Verification, VerificationStatus } from '@entities/verification.entity';

interface ProContactPayload {
  verificationId: string;
  professionalId: string;
  proEmail?: string;
  proPhone?: string;
  proName: string;
}

@Processor('pro-contact')
export class ProContactProcessor {
  private readonly logger = new Logger(ProContactProcessor.name);

  constructor(
    @InjectRepository(ProInvite) private readonly inviteRepo: Repository<ProInvite>,
    @InjectRepository(ProCommunication) private readonly commRepo: Repository<ProCommunication>,
    @InjectRepository(AiJob) private readonly jobRepo: Repository<AiJob>,
    @InjectRepository(CaseEvent) private readonly eventRepo: Repository<CaseEvent>,
    @InjectRepository(Verification) private readonly verifRepo: Repository<Verification>,
    @InjectQueue('pro-reminder') private readonly reminderQueue: Queue,
  ) {}

  @Process({ concurrency: 5 })
  async handle(job: Job<ProContactPayload>) {
    const { verificationId, professionalId, proEmail, proPhone, proName } = job.data;
    const start = Date.now();

    this.logger.log(`Contacting pro: ${proName} for verification ${verificationId}`);

    const aiJob = this.jobRepo.create({
      verificationId, professionalId, jobType: 'pro_contact',
      status: 'running', provider: 'twilio+sendgrid', startedAt: new Date(),
      inputData: { proEmail, proPhone, proName },
    });
    await this.jobRepo.save(aiJob);

    try {
      // Generate secure upload token
      const token = randomBytes(48).toString('base64url');
      const invite = this.inviteRepo.create({
        professionalId,
        verificationId,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600000), // 7 days
      });
      await this.inviteRepo.save(invite);

      const uploadUrl = `${process.env.UPLOAD_URL || 'https://upload.checkmypro.com'}/${token}`;
      let emailSent = false;
      let smsSent = false;

      // Send email
      if (proEmail) {
        // In production: await sendgrid.send(...)
        const comm = this.commRepo.create({
          verificationId, professionalId, channel: 'email',
          type: 'initial_request',
          contentSnapshot: `Bonjour ${proName}, un particulier souhaite vérifier votre entreprise via CheckMyPro. Déposez vos documents ici : ${uploadUrl}`,
          status: 'sent', sentAt: new Date(),
          externalId: `sg_simulated_${Date.now()}`,
        });
        await this.commRepo.save(comm);
        emailSent = true;
        this.logger.log(`Email sent to ${proEmail}`);
      }

      // Send SMS
      if (proPhone) {
        // In production: await twilio.messages.create(...)
        const comm = this.commRepo.create({
          verificationId, professionalId, channel: 'sms',
          type: 'initial_request',
          contentSnapshot: `CheckMyPro: Bonjour ${proName}, un client vérifie votre entreprise. Déposez vos documents : ${uploadUrl}`,
          status: 'sent', sentAt: new Date(),
          externalId: `tw_simulated_${Date.now()}`,
        });
        await this.commRepo.save(comm);
        smsSent = true;
        this.logger.log(`SMS sent to ${proPhone}`);
      }

      // Schedule reminders at J+2 and J+5
      await this.reminderQueue.add('remind', {
        verificationId, professionalId, proEmail, proPhone, proName,
        reminderNumber: 1,
      }, { delay: 2 * 24 * 3600000 }); // J+2

      await this.reminderQueue.add('remind', {
        verificationId, professionalId, proEmail, proPhone, proName,
        reminderNumber: 2,
      }, { delay: 5 * 24 * 3600000 }); // J+5

      // Schedule auto-close at J+7
      await this.reminderQueue.add('auto-close', {
        verificationId, professionalId,
      }, { delay: 7 * 24 * 3600000 });

      // Update verification status
      await this.verifRepo.update(verificationId, {
        status: VerificationStatus.AWAITING_PRO_DOCS,
      });

      // Update AI job
      const duration = Date.now() - start;
      await this.jobRepo.update(aiJob.id, {
        status: 'completed', durationMs: duration, completedAt: new Date(),
        outputData: { emailSent, smsSent, uploadToken: token },
      });

      // Log event
      await this.eventRepo.save(this.eventRepo.create({
        verificationId,
        eventType: 'pro_contacted',
        metadata: { emailSent, smsSent, uploadUrl },
      }));

      this.logger.log(`Pro contacted successfully: ${proName} (email:${emailSent} sms:${smsSent})`);

    } catch (error) {
      await this.jobRepo.update(aiJob.id, {
        status: 'failed', errorMessage: error.message,
        durationMs: Date.now() - start, completedAt: new Date(),
      });
      this.logger.error(`Pro contact failed: ${verificationId}`, error.stack);
      throw error;
    }
  }
}
