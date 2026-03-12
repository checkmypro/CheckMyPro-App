import { plainToInstance } from 'class-transformer';
import { IsString, IsNumber, IsOptional, validateSync, IsEnum } from 'class-validator';

enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
}

/**
 * Environment variable validation.
 * 
 * REQUIRED fields: the app will refuse to start if these are missing.
 * OPTIONAL fields: have defaults or are only needed in specific contexts.
 * 
 * To add a new required variable:
 *   1. Add it here with @IsString() (no @IsOptional)
 *   2. Add it to .env.example
 *   3. Add it to CI workflow env section
 *   4. Add it to deployment config
 */
class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  // ── Database (REQUIRED) ──
  @IsString()
  DATABASE_HOST: string;

  @IsNumber()
  @IsOptional()
  DATABASE_PORT: number = 5432;

  @IsString()
  DATABASE_NAME: string;

  @IsString()
  DATABASE_USER: string;

  @IsString()
  DATABASE_PASSWORD: string;

  // ── Redis (REQUIRED for health check + future queues) ──
  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  // ── JWT (REQUIRED) ──
  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRATION?: string; // default '15m' in auth service

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRATION?: string; // default '7d' in auth service

  // ── Optional (Lot 2+) ──
  @IsString()
  @IsOptional()
  API_URL?: string; // used for building URLs in emails — not needed for Lot 1

  @IsString()
  @IsOptional()
  STRIPE_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  STRIPE_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @IsString()
  @IsOptional()
  DATABASE_SSL?: string;

  @IsString()
  @IsOptional()
  DATABASE_LOGGING?: string;

  @IsNumber()
  @IsOptional()
  THROTTLE_TTL?: number;

  @IsNumber()
  @IsOptional()
  THROTTLE_LIMIT?: number;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints || {}).join(', ')}`)
      .join('\n');
    throw new Error(`\nEnvironment validation failed:\n${messages}\n\nCheck .env.example for required variables.\n`);
  }

  return validated;
}
