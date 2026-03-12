import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const corsOrigins = config.get<string>('CORS_ORIGINS', '').split(',').filter(Boolean);

  // Security
  app.use(helmet());
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Swagger (non-production only)
  if (config.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CheckMyPro API')
      .setDescription('API de vérification de professionnels')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentification')
      .addTag('users', 'Gestion utilisateurs')
      .addTag('verifications', 'Dossiers de vérification')
      .addTag('admin', 'Back-office')
      .addTag('health', 'Monitoring')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(port);
  console.log(`🚀 CheckMyPro API running on port ${port}`);
  console.log(`📋 Environment: ${config.get('NODE_ENV', 'development')}`);
  if (config.get('NODE_ENV') !== 'production') {
    console.log(`📚 Swagger: http://localhost:${port}/docs`);
  }
}

bootstrap();
