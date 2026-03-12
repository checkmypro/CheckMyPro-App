import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  console.log('🔧 CheckMyPro Workers started');
  console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('🎯 Listening on queues: admin-analysis, reputation-scan, digital-scan, document-analysis, scoring, pro-contact, pro-reminder, report-generation, notification, sla-check');
}

bootstrap();
