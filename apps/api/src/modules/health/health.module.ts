import { Module, Controller, Get, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { Public } from '@/common/decorators';

interface HealthCheck {
  status: string;
  latency?: number;
  error?: string;
}

interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime: number;
  timestamp: string;
  environment: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
  };
}

@Injectable()
class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();
  private redis: Redis | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    // Create a dedicated Redis client for health checks
    try {
      this.redis = new Redis({
        host: this.config.get('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6379),
        password: this.config.get('REDIS_PASSWORD') || undefined,
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        lazyConnect: true, // Don't connect until first use
      });
      // Suppress connection errors from crashing the app
      this.redis.on('error', (err) => {
        this.logger.warn(`Redis health client error: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(`Failed to create Redis health client: ${err.message}`);
    }
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }

  async check(): Promise<HealthStatus> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const checks = { database, redis };
    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    const anyDown = Object.values(checks).some((c) => c.status === 'down');

    return {
      status: allOk ? 'ok' : anyDown ? 'down' : 'degraded',
      version: '1.1.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      environment: this.config.get('NODE_ENV', 'development'),
      checks,
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    try {
      const start = Date.now();
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', latency: Date.now() - start };
    } catch (error) {
      this.logger.error(`Database health check failed: ${error.message}`);
      return { status: 'down', error: 'Connection failed' };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    if (!this.redis) {
      return { status: 'down', error: 'Redis client not initialized' };
    }
    try {
      const start = Date.now();
      await this.redis.ping();
      return { status: 'ok', latency: Date.now() - start };
    } catch (error) {
      this.logger.error(`Redis health check failed: ${error.message}`);
      return { status: 'down', error: 'Connection failed' };
    }
  }
}

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check — vérifie DB et Redis' })
  async check() {
    return this.healthService.check();
  }
}

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
