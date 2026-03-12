import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { getDatabaseConfig } from './config/database.config';
import { validateEnv } from './config/env.validation';
import { JwtAuthGuard, RolesGuard } from './common/guards';

// ── Lot 1.1 modules — stable, tested, production-ready ──
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';

// ── Lot 2 modules exist in the codebase but are NOT wired here yet. ──
// They will be imported once stabilized in Lot 2.1:
//   VerificationsModule, ProfessionalsModule, DocumentsModule,
//   PaymentsModule, ScoringModule, AdminModule
// Activating them requires BullModule (Redis queues) which is also deferred.

@Module({
  imports: [
    // ── Configuration ──
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),

    // ── Database ──
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),

    // ── Rate limiting ──
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ([{
        ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
        limit: config.get<number>('THROTTLE_LIMIT', 200),
      }]),
    }),

    // ── Stable modules ──
    AuthModule,
    UsersModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
