import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get('DATABASE_HOST'),
  port: config.get<number>('DATABASE_PORT', 5432),
  username: config.get('DATABASE_USER'),
  password: config.get('DATABASE_PASSWORD'),
  database: config.get('DATABASE_NAME'),
  ssl: config.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
  entities: [__dirname + '/../database/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false, // NEVER true in production — use migrations
  logging: config.get('DATABASE_LOGGING') === 'true',
  migrationsRun: true,
  extra: {
    max: 20, // connection pool size
    connectionTimeoutMillis: 5000,
  },
});
