import {
  Module, Controller, Get, Put, Post, Body, Param, Query, Injectable,
  NotFoundException, ForbiddenException, BadRequestException,
  Logger, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, Not, IsNull, LessThan } from 'typeorm';
import { IsString, IsOptional, IsEnum, IsBoolean, IsNumber } from 'class-validator';
import { Verification, VerificationStatus, Urgency, Priority, Verdict } from '@/database/entities/verification.entity';
import { CaseEvent, ScoringRecord, AiJob } from '@/database/entities/business.entity';
import { User, UserRole } from '@/database/entities/user.entity';
import { AuditLog } from '@/database/entities/auth.entity';
import { Roles, CurrentUser } from '@/common/decorators';
import { WorkflowService } from '@/modules/verifications/workflow.service';

// ── DTOs ──
export class UpdateCaseStatusDto {
  @IsEnum(VerificationStatus)
  status: VerificationStatus;

  @IsOptional() @IsString()
  note?: string;
}

export class AssignOperatorDto {
  @IsString()
  operatorId: string;
}

export class ValidateChecklistDto {
  @IsBoolean() adminValidated: boolean;
  @IsBoolean() insuranceValidated: boolean;
  @IsBoolean() moralityVerified: boolean;
  @IsBoolean() seniorityConfirmed: boolean;
  @IsBoolean() bonusApplied: boolean;

  @IsOptional() @IsString()
  operatorNotes?: string;

  @IsOptional() @IsNumber()
  scoreOverride?: number;
}

// ── SERVICE ──
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(Verification) private readonly verifRepo: Repository<Verification>,
    @InjectRepository(CaseEvent) private readonly eventRepo: Repository<CaseEvent>,
    @InjectRepository(ScoringRecord) private readonly scoreRepo: Repository<ScoringRecord>,
    @InjectRepository(AiJob) private readonly jobRepo: Repository<AiJob>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
    private readonly workflow: WorkflowService,
  ) {}

  // ── DASHBOARD ──
  async getDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [readyCount, inProgressCount, completedMonth, slaAlerts] = await Promise.all([
      this.verifRepo.count({ where: { status: VerificationStatus.READY_FOR_REVIEW } }),
      this.verifRepo.count({ where: { status: VerificationStatus.IN_PROGRESS } }),
      this.verifRepo.count({
        where: { status: VerificationStatus.COMPLETED, completedAt: Between(startOfMonth, now) },
      }),
      this.verifRepo.count({
        where: {
          status: In([
            VerificationStatus.READY_FOR_REVIEW,
            VerificationStatus.IN_PROGRESS,
            VerificationStatus.AI_ANALYSIS,
            VerificationStatus.AWAITING_PRO_DOCS,
          ]),
          slaDeadline: LessThan(new Date(Date.now() + 4 * 3600000)), // < 4h left
        },
      }),
    ]);

    return {
      readyForReview: readyCount,
      inProgress: inProgressCount,
      completedThisMonth: completedMonth,
      slaAlerts,
      timestamp: now.toISOString(),
    };
  }

  // ── CASES LIST (with filters, pagination, sorting) ──
  async getCases(filters: {
    status?: string;
    urgency?: string;
    operatorId?: string;
    clientType?: string;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const qb = this.verifRepo.createQueryBuilder('v')
      .leftJoinAndSelect('v.user', 'client')
      .leftJoinAndSelect('v.assignedOperator', 'operator')
      .where('v.deletedAt IS NULL');

    if (filters.status) qb.andWhere('v.status = :status', { status: filters.status });
    if (filters.urgency) qb.andWhere('v.urgency = :urgency', { urgency: filters.urgency });
    if (filters.operatorId) qb.andWhere('v.assignedOperatorId = :opId', { opId: filters.operatorId });
    if (filters.clientType) qb.andWhere('v.clientType = :ct', { ct: filters.clientType });
    if (filters.search) {
      qb.andWhere(
        '(v.reference ILIKE :q OR client.firstName ILIKE :q OR client.lastName ILIKE :q)',
        { q: `%${filters.search}%` },
      );
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 25, 100);

    qb.orderBy('v.slaDeadline', 'ASC', 'NULLS LAST')
      .addOrderBy('v.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((v) => this.formatCase(v)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // ── CASE DETAIL ──
  async getCaseDetail(id: string) {
    const verif = await this.verifRepo.findOne({
      where: { id },
      relations: ['user', 'assignedOperator'],
    });
    if (!verif) throw new NotFoundException('Dossier introuvable');

    const [events, scores, jobs] = await Promise.all([
      this.eventRepo.find({ where: { verificationId: id }, order: { createdAt: 'DESC' } }),
      this.scoreRepo.find({ where: { verificationId: id }, order: { createdAt: 'DESC' } }),
      this.jobRepo.find({ where: { verificationId: id }, order: { createdAt: 'DESC' } }),
    ]);

    return {
      ...this.formatCase(verif),
      operatorNotes: verif.operatorNotes,
      aiObservations: verif.aiObservations,
      ocrRawData: verif.ocrRawData,
      timeline: events,
      scoringHistory: scores,
      aiJobs: jobs,
      allowedTransitions: this.workflow.getAllowedTransitions(verif.status),
    };
  }

  // ── CHANGE STATUS ──
  async updateStatus(id: string, dto: UpdateCaseStatusDto, actor: User) {
    const verif = await this.verifRepo.findOne({ where: { id } });
    if (!verif) throw new NotFoundException('Dossier introuvable');

    // Check operator scope
    if (actor.role === UserRole.OPERATOR && verif.assignedOperatorId !== actor.id) {
      throw new ForbiddenException('Ce dossier ne vous est pas assigné');
    }

    // Validate transition
    if (!this.workflow.canTransition(verif.status, dto.status)) {
      throw new BadRequestException(
        `Transition non autorisée : ${verif.status} → ${dto.status}`,
      );
    }

    const oldStatus = verif.status;
    verif.status = dto.status;

    // Track timing
    if (dto.status === VerificationStatus.IN_PROGRESS && !verif.timeToFirstOpen) {
      verif.timeToFirstOpen = Math.round((Date.now() - verif.createdAt.getTime()) / 1000);
      if (!verif.assignedOperatorId) {
        verif.assignedOperatorId = actor.id;
        verif.assignedAt = new Date();
      }
    }

    if (dto.status === VerificationStatus.COMPLETED) {
      verif.completedAt = new Date();
      verif.timeTotalResolution = Math.round((Date.now() - verif.createdAt.getTime()) / 1000);
    }

    await this.verifRepo.save(verif);

    // Log event
    await this.eventRepo.save(this.eventRepo.create({
      verificationId: id,
      eventType: 'status_changed',
      actorId: actor.id,
      actorRole: actor.role,
      fromStatus: oldStatus,
      toStatus: dto.status,
      note: dto.note || null,
    }));

    // Audit
    await this.auditRepo.save(this.auditRepo.create({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'verification.status_changed',
      entityType: 'verification',
      entityId: id,
      oldValue: { status: oldStatus },
      newValue: { status: dto.status },
    }));

    this.logger.log(`Case ${verif.reference}: ${oldStatus} → ${dto.status} by ${actor.email}`);

    return { id, reference: verif.reference, oldStatus, newStatus: dto.status };
  }

  // ── ASSIGN OPERATOR ──
  async assignOperator(id: string, dto: AssignOperatorDto, actor: User) {
    const verif = await this.verifRepo.findOne({ where: { id } });
    if (!verif) throw new NotFoundException('Dossier introuvable');

    const operator = await this.userRepo.findOne({ where: { id: dto.operatorId } });
    if (!operator || !operator.isStaff) {
      throw new BadRequestException('Opérateur invalide');
    }

    const oldOperator = verif.assignedOperatorId;
    verif.assignedOperatorId = dto.operatorId;
    verif.assignedAt = new Date();
    await this.verifRepo.save(verif);

    await this.eventRepo.save(this.eventRepo.create({
      verificationId: id,
      eventType: 'operator_assigned',
      actorId: actor.id,
      actorRole: actor.role,
      metadata: { fromOperator: oldOperator, toOperator: dto.operatorId },
    }));

    return { id, assignedTo: operator.fullName };
  }

  // ── VALIDATE (operator completes checklist) ──
  async validateChecklist(id: string, dto: ValidateChecklistDto, actor: User) {
    const verif = await this.verifRepo.findOne({ where: { id } });
    if (!verif) throw new NotFoundException('Dossier introuvable');

    if (verif.status !== VerificationStatus.IN_PROGRESS) {
      throw new BadRequestException('Le dossier doit être en traitement');
    }

    // All checks must be done (except bonus which is optional)
    if (!dto.adminValidated || !dto.insuranceValidated || !dto.moralityVerified || !dto.seniorityConfirmed) {
      throw new BadRequestException('Toutes les cases de la checklist doivent être cochées');
    }

    // Update operator notes
    verif.operatorNotes = dto.operatorNotes || verif.operatorNotes;
    await this.verifRepo.save(verif);

    await this.eventRepo.save(this.eventRepo.create({
      verificationId: id,
      eventType: 'checklist_validated',
      actorId: actor.id,
      actorRole: actor.role,
      metadata: {
        adminValidated: dto.adminValidated,
        insuranceValidated: dto.insuranceValidated,
        moralityVerified: dto.moralityVerified,
        seniorityConfirmed: dto.seniorityConfirmed,
        bonusApplied: dto.bonusApplied,
        scoreOverride: dto.scoreOverride,
      },
    }));

    return { validated: true };
  }

  // ── OPERATOR STATS ──
  async getOperatorStats() {
    const operators = await this.userRepo.find({
      where: { role: In([UserRole.OPERATOR, UserRole.OPERATOR_SENIOR]) },
    });

    const stats = await Promise.all(operators.map(async (op) => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [completed, totalAssigned] = await Promise.all([
        this.verifRepo.count({
          where: {
            assignedOperatorId: op.id,
            status: VerificationStatus.COMPLETED,
            completedAt: Between(startOfMonth, now),
          },
        }),
        this.verifRepo.count({
          where: { assignedOperatorId: op.id },
        }),
      ]);

      return {
        id: op.id,
        name: op.fullName,
        role: op.role,
        completedThisMonth: completed,
        totalAssigned,
      };
    }));

    return stats;
  }

  // ── SLA ALERTS ──
  async getSlaAlerts() {
    const alerts = await this.verifRepo.find({
      where: {
        status: In([
          VerificationStatus.READY_FOR_REVIEW,
          VerificationStatus.IN_PROGRESS,
          VerificationStatus.AI_ANALYSIS,
          VerificationStatus.AWAITING_PRO_DOCS,
        ]),
        slaDeadline: Not(IsNull()),
      },
      relations: ['user', 'assignedOperator'],
      order: { slaDeadline: 'ASC' },
    });

    return alerts
      .filter((v) => v.slaRemainingMs !== null && v.slaRemainingMs < 12 * 3600000)
      .map((v) => ({
        id: v.id,
        reference: v.reference,
        status: v.status,
        urgency: v.urgency,
        slaDeadline: v.slaDeadline,
        slaRemainingHours: Math.round((v.slaRemainingMs || 0) / 3600000 * 10) / 10,
        isBreached: v.isSlaBreached,
        operator: v.assignedOperator?.fullName || 'Non assigné',
      }));
  }

  private formatCase(v: Verification) {
    return {
      id: v.id,
      reference: v.reference,
      status: v.status,
      urgency: v.urgency,
      priority: v.priority,
      clientType: v.clientType,
      client: v.user ? { id: v.user.id, name: v.user.fullName, email: v.user.email } : null,
      professionalId: v.professionalId,
      quoteAmount: v.quoteAmount,
      workType: v.workType,
      verdict: v.verdict,
      slaDeadline: v.slaDeadline,
      slaRemainingHours: v.slaRemainingMs ? Math.round(v.slaRemainingMs / 3600000 * 10) / 10 : null,
      isSlaBreached: v.isSlaBreached,
      operator: v.assignedOperator ? { id: v.assignedOperator.id, name: v.assignedOperator.fullName } : null,
      isPremium: v.isPremiumVerification,
      createdAt: v.createdAt,
      completedAt: v.completedAt,
      version: v.version,
    };
  }
}

// ── CONTROLLER ──
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('dashboard')
  @Roles(UserRole.OPERATOR, UserRole.OPERATOR_SENIOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Dashboard KPIs' })
  async dashboard() { return this.service.getDashboard(); }

  @Get('dashboard/sla-alerts')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Alertes SLA' })
  async slaAlerts() { return this.service.getSlaAlerts(); }

  @Get('cases')
  @Roles(UserRole.OPERATOR, UserRole.OPERATOR_SENIOR, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Lister les dossiers (filtres)' })
  async cases(
    @Query('status') status?: string,
    @Query('urgency') urgency?: string,
    @Query('operatorId') operatorId?: string,
    @Query('clientType') clientType?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getCases({ status, urgency, operatorId, clientType, search, page, limit });
  }

  @Get('cases/:id')
  @Roles(UserRole.OPERATOR, UserRole.OPERATOR_SENIOR, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Détail complet dossier' })
  async caseDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCaseDetail(id);
  }

  @Put('cases/:id/status')
  @Roles(UserRole.OPERATOR, UserRole.OPERATOR_SENIOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Changer statut dossier' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCaseStatusDto,
    @CurrentUser() user: User,
  ) {
    return this.service.updateStatus(id, dto, user);
  }

  @Put('cases/:id/assign')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Assigner un opérateur' })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignOperatorDto,
    @CurrentUser() user: User,
  ) {
    return this.service.assignOperator(id, dto, user);
  }

  @Post('cases/:id/checklist')
  @Roles(UserRole.OPERATOR, UserRole.OPERATOR_SENIOR, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Valider la checklist opérateur' })
  async validateChecklist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateChecklistDto,
    @CurrentUser() user: User,
  ) {
    return this.service.validateChecklist(id, dto, user);
  }

  @Get('operators/stats')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Performance opérateurs' })
  async operatorStats() { return this.service.getOperatorStats(); }
}

// ── MODULE ──
@Module({
  imports: [
    TypeOrmModule.forFeature([Verification, CaseEvent, ScoringRecord, AiJob, User, AuditLog]),
  ],
  controllers: [AdminController],
  providers: [AdminService, WorkflowService],
  exports: [AdminService],
})
export class AdminModule {}
