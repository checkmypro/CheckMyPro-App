import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { VerificationsController } from './verifications.controller';
import { VerificationsService } from './verifications.service';
import { WorkflowService } from './workflow.service';
import { Verification } from '@/database/entities/verification.entity';
import { Professional } from '@/database/entities/professional.entity';
import { CaseEvent, AiJob } from '@/database/entities/business.entity';
import { AuditLog } from '@/database/entities/auth.entity';
import { User } from '@/database/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Verification,
      Professional,
      CaseEvent,
      AiJob,
      AuditLog,
      User,
    ]),
    BullModule.registerQueue(
      { name: 'admin-analysis' },
      { name: 'reputation-scan' },
      { name: 'digital-scan' },
      { name: 'pro-contact' },
      { name: 'scoring' },
    ),
  ],
  controllers: [VerificationsController],
  providers: [VerificationsService, WorkflowService],
  exports: [VerificationsService, WorkflowService],
})
export class VerificationsModule {}
