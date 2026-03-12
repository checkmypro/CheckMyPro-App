import {
  Module, Controller, Get, Post, Body, Param, Query, Injectable,
  NotFoundException, BadRequestException, ForbiddenException, Logger, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { BullModule } from '@nestjs/bull';
import { Queue } from 'bull';
import { IsString, IsEnum, IsOptional, IsNumber, MaxLength } from 'class-validator';
import { createHash, randomBytes } from 'crypto';
import { Document } from '@/database/entities/business.entity';
import { Verification } from '@/database/entities/verification.entity';
import { AuditLog } from '@/database/entities/auth.entity';
import { CurrentUser } from '@/common/decorators';
import { User } from '@/database/entities/user.entity';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ── DTOs ──
export class RequestUploadUrlDto {
  @IsString() @MaxLength(255)
  filename: string;

  @IsString()
  mimeType: string;

  @IsNumber()
  fileSize: number;

  @IsString()
  verificationId: string;

  @IsEnum(['kbis', 'urssaf', 'insurance_rc', 'insurance_decennial', 'certification', 'quote', 'identity', 'other'])
  documentType: string;
}

export class ConfirmUploadDto {
  @IsString()
  storageKey: string;

  @IsString()
  verificationId: string;

  @IsString() @MaxLength(255)
  filename: string;

  @IsNumber()
  fileSize: number;

  @IsString()
  mimeType: string;

  @IsString()
  documentType: string;

  @IsOptional() @IsString()
  checksumSha256?: string;
}

// ── SERVICE ──
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(Document) private readonly docRepo: Repository<Document>,
    @InjectRepository(Verification) private readonly verifRepo: Repository<Verification>,
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
    @InjectQueue('document-analysis') private readonly analysisQueue: Queue,
  ) {}

  async requestUploadUrl(userId: string, dto: RequestUploadUrlDto) {
    // Validate MIME
    if (!ALLOWED_MIME.includes(dto.mimeType)) {
      throw new BadRequestException(`Type de fichier non autorisé. Formats acceptés : PDF, JPG, PNG`);
    }
    // Validate size
    if (dto.fileSize > MAX_FILE_SIZE) {
      throw new BadRequestException(`Fichier trop volumineux. Maximum : 10 Mo`);
    }
    // Verify ownership
    const verif = await this.verifRepo.findOne({ where: { id: dto.verificationId, userId } });
    if (!verif) throw new ForbiddenException('Vérification non trouvée');

    // Generate storage key
    const ext = dto.filename.split('.').pop()?.toLowerCase() || 'bin';
    const docId = randomBytes(16).toString('hex');
    const storageKey = `verifications/${verif.id}/client/${docId}.${ext}`;

    // In production: generate S3 presigned PUT URL
    // const presignedUrl = await this.s3.getSignedUrl('putObject', {
    //   Bucket: process.env.AWS_S3_BUCKET,
    //   Key: storageKey,
    //   ContentType: dto.mimeType,
    //   Expires: 900, // 15 minutes
    // });

    // For now, return the key (presigned URL generation will be in S3 provider)
    return {
      storageKey,
      uploadUrl: `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${storageKey}`,
      expiresIn: 900,
      method: 'PUT',
      headers: {
        'Content-Type': dto.mimeType,
      },
    };
  }

  async confirmUpload(userId: string, dto: ConfirmUploadDto) {
    // Verify ownership
    const verif = await this.verifRepo.findOne({ where: { id: dto.verificationId, userId } });
    if (!verif) throw new ForbiddenException('Vérification non trouvée');

    // Check for duplicate (same checksum)
    if (dto.checksumSha256) {
      const existing = await this.docRepo.findOne({
        where: {
          checksumSha256: dto.checksumSha256,
          verificationId: dto.verificationId,
        },
      });
      if (existing) {
        this.logger.warn(`Duplicate document detected: ${dto.checksumSha256}`);
        return { document: existing, duplicate: true };
      }
    }

    // Create document record
    const doc = this.docRepo.create({
      verificationId: dto.verificationId,
      professionalId: verif.professionalId,
      uploadedBy: 'client',
      uploaderId: userId,
      type: dto.documentType,
      originalFilename: this.sanitizeFilename(dto.filename),
      storageKey: dto.storageKey,
      fileSize: dto.fileSize,
      mimeType: dto.mimeType,
      checksumSha256: dto.checksumSha256 || null,
      status: 'pending',
    });

    await this.docRepo.save(doc);

    // Enqueue IA analysis
    await this.analysisQueue.add('analyze', {
      documentId: doc.id,
      storageKey: doc.storageKey,
      verificationId: dto.verificationId,
      mimeType: dto.mimeType,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: true,
    });

    // Audit
    await this.auditRepo.save(this.auditRepo.create({
      actorId: userId,
      action: 'document.uploaded',
      entityType: 'document',
      entityId: doc.id,
      newValue: { filename: doc.originalFilename, type: doc.type, size: doc.fileSize },
    }));

    this.logger.log(`Document uploaded: ${doc.id} for verification ${dto.verificationId}`);
    return { document: doc, duplicate: false };
  }

  async getDownloadUrl(userId: string, documentId: string) {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document introuvable');

    // Verify user has access (owner of the verification)
    if (doc.verificationId) {
      const verif = await this.verifRepo.findOne({ where: { id: doc.verificationId, userId } });
      if (!verif) throw new ForbiddenException('Accès refusé');
    }

    // Audit access
    await this.auditRepo.save(this.auditRepo.create({
      actorId: userId,
      action: 'document.accessed',
      entityType: 'document',
      entityId: doc.id,
    }));

    // In production: generate presigned GET URL
    return {
      downloadUrl: `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${doc.storageKey}`,
      expiresIn: 3600,
      filename: doc.originalFilename,
      mimeType: doc.mimeType,
    };
  }

  async findByVerification(verificationId: string): Promise<Document[]> {
    return this.docRepo.find({
      where: { verificationId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateDocumentStatus(id: string, status: Document['status'], metadata?: Record<string, any>) {
    const update: Partial<Document> = { status };
    if (metadata) {
      update.aiMetadata = metadata;
      update.aiDetectedType = metadata.detectedType || null;
      update.aiConfidence = metadata.confidence || null;
    }
    await this.docRepo.update(id, update);
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255);
  }
}

// ── CONTROLLER ──
@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Post('upload-url')
  @ApiOperation({ summary: 'Obtenir une URL présignée pour upload' })
  async requestUploadUrl(
    @CurrentUser() user: User,
    @Body() dto: RequestUploadUrlDto,
  ) {
    return this.service.requestUploadUrl(user.id, dto);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirmer un upload' })
  async confirmUpload(
    @CurrentUser() user: User,
    @Body() dto: ConfirmUploadDto,
  ) {
    return this.service.confirmUpload(user.id, dto);
  }

  @Get(':id/download-url')
  @ApiOperation({ summary: 'Obtenir URL de téléchargement' })
  async getDownloadUrl(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getDownloadUrl(user.id, id);
  }
}

// ── MODULE ──
@Module({
  imports: [
    TypeOrmModule.forFeature([Document, Verification, AuditLog]),
    BullModule.registerQueue({ name: 'document-analysis' }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
