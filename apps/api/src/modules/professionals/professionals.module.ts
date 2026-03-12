import {
  Module, Controller, Get, Post, Body, Param, Query, Injectable,
  NotFoundException, Logger, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import {
  Professional, ProAdminData, ProReputationData, ProDigitalData,
} from '@/database/entities/professional.entity';
import { CurrentUser, Roles } from '@/common/decorators';
import { User, UserRole } from '@/database/entities/user.entity';

// ── DTOs ──
export class CreateProfessionalDto {
  @IsString() @MaxLength(255)
  companyName: string;

  @IsOptional() @IsString() @Matches(/^\d{14}$/, { message: 'SIRET invalide (14 chiffres)' })
  siret?: string;

  @IsOptional() @IsString()
  email?: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsString()
  city?: string;

  @IsOptional() @IsString() @MaxLength(100)
  tradeType?: string;
}

// ── SERVICE ──
@Injectable()
export class ProfessionalsService {
  private readonly logger = new Logger(ProfessionalsService.name);

  constructor(
    @InjectRepository(Professional) private readonly proRepo: Repository<Professional>,
    @InjectRepository(ProAdminData) private readonly adminDataRepo: Repository<ProAdminData>,
    @InjectRepository(ProReputationData) private readonly repDataRepo: Repository<ProReputationData>,
    @InjectRepository(ProDigitalData) private readonly digDataRepo: Repository<ProDigitalData>,
  ) {}

  async findOrCreate(dto: CreateProfessionalDto): Promise<Professional> {
    // Try to find by SIRET first (most reliable)
    if (dto.siret) {
      const existing = await this.proRepo.findOne({ where: { siret: dto.siret } });
      if (existing) {
        this.logger.log(`Pro found by SIRET: ${dto.siret} → ${existing.id}`);
        return existing;
      }
    }

    // Try by name + city
    if (dto.companyName && dto.city) {
      const existing = await this.proRepo.findOne({
        where: {
          companyName: ILike(`%${dto.companyName}%`),
          city: ILike(`%${dto.city}%`),
        },
      });
      if (existing) {
        this.logger.log(`Pro found by name+city: ${dto.companyName} → ${existing.id}`);
        return existing;
      }
    }

    // Create new professional
    const pro = this.proRepo.create({
      companyName: dto.companyName,
      siret: dto.siret || null,
      email: dto.email || null,
      phone: dto.phone || null,
      city: dto.city || null,
      tradeType: dto.tradeType || null,
    });

    await this.proRepo.save(pro);
    this.logger.log(`New professional created: ${pro.companyName} → ${pro.id}`);
    return pro;
  }

  async findById(id: string): Promise<Professional> {
    const pro = await this.proRepo.findOne({ where: { id } });
    if (!pro) throw new NotFoundException('Professionnel introuvable');
    return pro;
  }

  async search(query: string, page = 1, limit = 25) {
    const [items, total] = await this.proRepo.findAndCount({
      where: [
        { companyName: ILike(`%${query}%`) },
        { siret: ILike(`%${query}%`) },
        { city: ILike(`%${query}%`) },
      ],
      order: { totalVerifications: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getFullProfile(id: string) {
    const pro = await this.findById(id);
    const adminData = await this.adminDataRepo.find({
      where: { professionalId: id },
      order: { fetchedAt: 'DESC' },
      take: 1,
    });
    const reputationData = await this.repDataRepo.find({
      where: { professionalId: id },
      order: { scrapedAt: 'DESC' },
    });
    const digitalData = await this.digDataRepo.find({
      where: { professionalId: id },
      order: { scannedAt: 'DESC' },
      take: 1,
    });

    return {
      professional: pro,
      adminData: adminData[0] || null,
      reputationData,
      digitalData: digitalData[0] || null,
    };
  }

  async incrementVerificationCount(id: string) {
    await this.proRepo.increment({ id }, 'totalVerifications', 1);
    await this.proRepo.update(id, { lastVerifiedAt: new Date() });
  }

  async updateOverallScore(id: string, score: number) {
    await this.proRepo.update(id, { overallScore: score });
  }
}

// ── CONTROLLER ──
@ApiTags('professionals')
@ApiBearerAuth()
@Controller('professionals')
class ProfessionalsController {
  constructor(private readonly service: ProfessionalsService) {}

  @Get('search')
  @ApiOperation({ summary: 'Rechercher un professionnel' })
  @ApiQuery({ name: 'q', required: true })
  async search(
    @Query('q') q: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.service.search(q, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Profil complet d\'un professionnel' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getFullProfile(id);
  }
}

// ── MODULE ──
@Module({
  imports: [
    TypeOrmModule.forFeature([Professional, ProAdminData, ProReputationData, ProDigitalData]),
  ],
  controllers: [ProfessionalsController],
  providers: [ProfessionalsService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
