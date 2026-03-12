import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

// Entities via tsconfig path alias @entities/
import { Verification } from '@entities/verification.entity';
import { User } from '@entities/user.entity';
import {
  Professional, ProAdminData, ProReputationData,
  ProDigitalData, ProInvite,
} from '@entities/professional.entity';
import {
  Document, ScoringRecord, AiJob, CaseEvent,
  ProCommunication, Notification,
} from '@entities/business.entity';
import { AuditLog } from '@entities/auth.entity';

// Processors — only queues with real implementations
import { AdminAnalysisProcessor } from './processors/admin-analysis.processor';
import { ScoringProcessor } from './processors/scoring.processor';
import { ProContactProcessor } from './processors/pro-contact.processor';
import { SlaCheckProcessor } from './processors/sla-check.processor';

// Queues that have a processor in THIS lot
const IMPLEMENTED_QUEUES = [
  'admin-analysis',
  'scoring',
  'pro-contact',
  'pro-reminder', // used by pro-contact for delayed jobs
  'sla-check',
];

// Queues planned for Lot 3 (not yet implemented):
// 'reputation-scan', 'digital-scan', 'document-analysis',
// 'report-generation', 'notification'

const ALL_ENTITIES = [
  Verification, User, Professional, ProAdminData, ProReputationData,
  ProDigitalData, ProInvite, Document, ScoringRecord, AiJob,
  CaseEvent, ProCommunication, Notification, AuditLog,
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get('DATABASE_HOST'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.get('DATABASE_USER'),
        password: config.get('DATABASE_PASSWORD'),
        database: config.get('DATABASE_NAME'),
        entities: ALL_ENTITIES,
        synchronize: false,
      }),
    }),

    TypeOrmModule.forFeature(ALL_ENTITIES),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD') || undefined,
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      }),
    }),

    ...IMPLEMENTED_QUEUES.map((name) => BullModule.registerQueue({ name })),
  ],
  providers: [
    AdminAnalysisProcessor,
    ScoringProcessor,
    ProContactProcessor,
    SlaCheckProcessor,
  ],
})
export class WorkerModule {}
