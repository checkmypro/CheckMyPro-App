import {
  Module, Controller, Get, Put, Delete, Body, Injectable,
  NotFoundException, Logger, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import { User } from '@/database/entities/user.entity';
import { AuditLog } from '@/database/entities/auth.entity';
import { CurrentUser } from '@/common/decorators';

// ── Request Context (same pattern as auth module) ──
interface RequestContext {
  ip?: string;
  userAgent?: string;
}

function extractContext(req: Request): RequestContext {
  return {
    ip: req.ip || req.socket?.remoteAddress || undefined,
    userAgent: req.get('user-agent') || undefined,
  };
}

// ── DTO ──
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(100)
  lastName?: string;

  @IsOptional() @IsString()
  @Matches(/^(\+33|0)[1-9]\d{8}$/, { message: 'Numéro FR invalide' })
  phone?: string;

  @IsOptional() @IsString() @MaxLength(255)
  address?: string;

  @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  @IsOptional() @IsString() @MaxLength(10)
  postalCode?: string;
}

// ── SERVICE ──
@Injectable()
class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async getProfile(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return this.sanitize(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto, ctx: RequestContext = {}) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined && (user as any)[key] !== value) {
        oldValues[key] = (user as any)[key];
        newValues[key] = value;
        (user as any)[key] = value;
      }
    }

    if (Object.keys(newValues).length > 0) {
      await this.usersRepo.save(user);
      await this.audit('user.profile_updated', userId, userId, oldValues, newValues, ctx);
      this.logger.log(`Profile updated: ${userId}`);
    }

    return this.sanitize(user);
  }

  async deleteAccount(userId: string, ctx: RequestContext = {}) {
    await this.usersRepo.softDelete(userId);
    await this.audit('user.account_deleted', userId, userId, null, null, ctx);
    this.logger.log(`Account soft-deleted: ${userId}`);
    return { message: 'Compte supprimé. Vos données seront anonymisées sous 30 jours.' };
  }

  async getStats(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    return {
      xpPoints: user.xpPoints,
      totalSecured: user.totalSecured,
      isPremium: user.isPremium,
      referralCode: user.referralCode,
      memberSince: user.createdAt,
    };
  }

  async exportData(userId: string, ctx: RequestContext = {}) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    await this.audit('user.data_exported', userId, userId, null, null, ctx);

    return {
      personalInfo: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        address: user.address,
        city: user.city,
        postalCode: user.postalCode,
      },
      account: {
        role: user.role,
        clientType: user.clientType,
        isPremium: user.isPremium,
        createdAt: user.createdAt,
      },
      exportedAt: new Date().toISOString(),
      note: 'Export RGPD — Article 20 du RGPD (droit à la portabilité)',
    };
  }

  private async audit(
    action: string, actorId: string, entityId: string,
    oldValue: any, newValue: any, ctx: RequestContext,
  ) {
    await this.auditRepo.save(this.auditRepo.create({
      actorId,
      action,
      entityType: 'user',
      entityId,
      oldValue,
      newValue,
      ipAddress: ctx.ip || null,
      userAgent: ctx.userAgent || null,
    }));
  }

  private sanitize(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      address: user.address,
      city: user.city,
      postalCode: user.postalCode,
      role: user.role,
      clientType: user.clientType,
      isPremium: user.isPremium,
      emailVerified: user.emailVerified,
      xpPoints: user.xpPoints,
      totalSecured: user.totalSecured,
      referralCode: user.referralCode,
      createdAt: user.createdAt,
    };
  }
}

// ── CONTROLLER ──
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Mon profil' })
  async getProfile(@CurrentUser() user: User) {
    return this.usersService.getProfile(user.id);
  }

  @Put('me')
  @ApiOperation({ summary: 'Modifier mon profil' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    return this.usersService.updateProfile(user.id, dto, extractContext(req));
  }

  @Delete('me')
  @ApiOperation({ summary: 'Supprimer mon compte' })
  async deleteAccount(@CurrentUser() user: User, @Req() req: Request) {
    return this.usersService.deleteAccount(user.id, extractContext(req));
  }

  @Get('me/stats')
  @ApiOperation({ summary: 'Mes statistiques' })
  async getStats(@CurrentUser() user: User) {
    return this.usersService.getStats(user.id);
  }

  @Get('me/data-export')
  @ApiOperation({ summary: 'Export RGPD de mes données' })
  async exportData(@CurrentUser() user: User, @Req() req: Request) {
    return this.usersService.exportData(user.id, extractContext(req));
  }
}

// ── MODULE ──
@Module({
  imports: [TypeOrmModule.forFeature([User, AuditLog])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
