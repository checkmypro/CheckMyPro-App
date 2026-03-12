import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { randomBytes } from 'crypto';
import { Verification, VerificationStatus, Urgency, Priority } from '@/database/entities/verification.entity';
import { Professional } from '@/database/entities/professional.entity';
import { CaseEvent } from '@/database/entities/business.entity';
import { AuditLog } from '@/database/entities/auth.entity';
import { User, UserRole } from '@/database/entities/user.entity';
import { WorkflowService } from './workflow.service';
import { CreateVerificationDto, ListVerificationsDto, AdminListCasesDto } from './dto';

const SLA_HOURS: Record<string, number> = {
  standard: 48,
  priority: 24,
  express: 4,
};

@Injectable()
export class VerificationsService {
  private readonly logger = new Logger(VerificationsService.name);

  constructor(
    @InjectRepository(Verification)
    private readonly verifRepo: Repository<Verification>,
    @InjectRepository(Professional)
    private readonly proRepo: Repository<Professional>,
    @InjectRepository(CaseEvent)
    private readonly eventsRepo: Repository<CaseEvent>,
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    private readonly workflowService: WorkflowService,
  ) {}

  // ── CREATE ──
  async create(userId: string, dto: CreateVerificationDto, clientType: string) {
    // Find or create professional
    let pro = await this.findOrCreateProfessional(dto);

    // Generate unique reference
    const reference = await this.generateReference();

    // Calculate SLA deadline
    const urgency = dto.urgency || Urgency.STANDARD;
    const slaHours = SLA_HOURS[urgency] || 48;
    const slaDeadline = new Date(Date.now() + slaHours * 3600000);

    // Create verification
    const verif = this.verifRepo.create({
      reference,
      userId,
      professionalId: pro.id,
      status: VerificationStatus.PENDING_PAYMENT,
      urgency,
      priority: this.calculatePriority(dto.quoteAmount, urgency),
      clientType,
      quoteAmount: dto.quoteAmount || null,
      quoteDate: dto.quoteDate ? new Date(dto.quoteDate) : null,
      workType: dto.workType || null,
      workAddress: dto.workAddress || null,
      workCity: dto.workCity || null,
      slaDeadline,
      isPremiumVerification: false, // Set by payment service
    });

    await this.verifRepo.save(verif);

    // Log creation event
    await this.eventsRepo.save(this.eventsRepo.create({
      verificationId: verif.id,
      eventType: 'case.created',
      actorId: userId,
      actorRole: 'user',
      toStatus: VerificationStatus.PENDING_PAYMENT,
      metadata: { reference, proId: pro.id, quoteAmount: dto.quoteAmount },
    }));

    this.logger.log(`Verification created: ${reference} for user ${userId}`);

    return {
      id: verif.id,
      reference: verif.reference,
      status: verif.status,
      professionalId: pro.id,
      slaDeadline: verif.slaDeadline,
    };
  }

  // ── LIST (client) ──
  async listForUser(userId: string, dto: ListVerificationsDto) {
    const page = dto.page || 1;
    const limit = Math.min(dto.limit || 25, 100);

    const qb = this.verifRepo.createQueryBuilder('v')
      .where('v.user_id = :userId', { userId })
      .andWhere('v.deleted_at IS NULL');

    if (dto.status) {
      qb.andWhere('v.status = :status', { status: dto.status });
    }

    if (dto.search) {
      qb.andWhere('v.reference ILIKE :search', { search: `%${dto.search}%` });
    }

    qb.orderBy('v.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((v) => this.sanitize(v)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── LIST (admin/operator) ──
  async listForAdmin(dto: AdminListCasesDto, operator?: User) {
    const page = dto.page || 1;
    const limit = Math.min(dto.limit || 25, 100);

    const qb = this.verifRepo.createQueryBuilder('v')
      .leftJoinAndSelect('v.user', 'client')
      .where('v.deleted_at IS NULL');

    // Operators see only assigned cases (unless supervisor+)
    if (operator && operator.role === UserRole.OPERATOR) {
      qb.andWhere('v.assigned_operator_id = :opId', { opId: operator.id });
    }

    if (dto.status) {
      qb.andWhere('v.status = :status', { status: dto.status });
    }
    if (dto.urgency) {
      qb.andWhere('v.urgency = :urgency', { urgency: dto.urgency });
    }
    if (dto.priority) {
      qb.andWhere('v.priority = :priority', { priority: dto.priority });
    }
    if (dto.operatorId) {
      qb.andWhere('v.assigned_operator_id = :assignedOp', { assignedOp: dto.operatorId });
    }
    if (dto.clientType) {
      qb.andWhere('v.client_type = :ct', { ct: dto.clientType });
    }
    if (dto.search) {
      qb.andWhere('(v.reference ILIKE :s)', { s: `%${dto.search}%` });
    }

    const sortBy = dto.sortBy || 'sla_deadline';
    const sortOrder = dto.sortOrder || 'ASC';
    const allowedSorts = ['created_at', 'sla_deadline', 'quote_amount', 'status', 'urgency'];
    if (allowedSorts.includes(sortBy)) {
      qb.orderBy(`v.${sortBy}`, sortOrder);
    } else {
      qb.orderBy('v.sla_deadline', 'ASC');
    }

    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── GET BY ID ──
  async getById(id: string, userId?: string) {
    const verif = await this.verifRepo.findOne({
      where: { id },
      relations: ['user', 'assignedOperator'],
    });

    if (!verif) throw new NotFoundException('Dossier introuvable');

    // Ownership check for regular users
    if (userId && verif.userId !== userId) {
      throw new ForbiddenException('Accès refusé à ce dossier');
    }

    return verif;
  }

  // ── GET TIMELINE ──
  async getTimeline(verificationId: string) {
    return this.eventsRepo.find({
      where: { verificationId },
      order: { createdAt: 'ASC' },
    });
  }

  // ── TRANSITION (via workflow) ──
  async changeStatus(
    verificationId: string,
    toStatus: VerificationStatus,
    actorId: string,
    actorRole: string,
    note?: string,
  ) {
    return this.workflowService.transition(
      verificationId, toStatus, actorId, actorRole, note,
    );
  }

  // ── ASSIGN OPERATOR ──
  async assignOperator(verificationId: string, operatorId: string, assignedBy: string) {
    const verif = await this.verifRepo.findOne({ where: { id: verificationId } });
    if (!verif) throw new NotFoundException();

    const oldOperator = verif.assignedOperatorId;
    verif.assignedOperatorId = operatorId;
    verif.assignedAt = new Date();
    await this.verifRepo.save(verif);

    await this.eventsRepo.save(this.eventsRepo.create({
      verificationId,
      eventType: 'case.assigned',
      actorId: assignedBy,
      metadata: { oldOperator, newOperator: operatorId },
    }));

    return verif;
  }

  // ── HELPERS ──

  private async findOrCreateProfessional(dto: CreateVerificationDto): Promise<Professional> {
    // Try to find existing pro by SIRET
    if (dto.proSiret) {
      const existing = await this.proRepo.findOne({
        where: { siret: dto.proSiret },
      });
      if (existing) return existing;
    }

    // Create new pro
    const pro = this.proRepo.create({
      companyName: dto.proCompanyName,
      siret: dto.proSiret || null,
      email: dto.proEmail || null,
      phone: dto.proPhone || null,
      city: dto.proCity || null,
      tradeType: dto.workType || null,
    });

    return this.proRepo.save(pro);
  }

  private async generateReference(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear();
    const seq = Math.floor(10000 + Math.random() * 90000);
    const ref = `CMP-${year}-${seq}`;

    // Ensure uniqueness
    const exists = await this.verifRepo.findOne({ where: { reference: ref } });
    if (exists) return this.generateReference(); // Retry (collision extremely rare)

    return ref;
  }

  private calculatePriority(amount: number | undefined, urgency: Urgency): Priority {
    if (urgency === Urgency.EXPRESS) return Priority.URGENT;
    if (urgency === Urgency.PRIORITY) return Priority.HIGH;
    if (amount && amount > 50000) return Priority.HIGH;
    return Priority.NORMAL;
  }

  private sanitize(v: Verification) {
    return {
      id: v.id,
      reference: v.reference,
      status: v.status,
      urgency: v.urgency,
      priority: v.priority,
      quoteAmount: v.quoteAmount,
      workType: v.workType,
      verdict: v.verdict,
      slaDeadline: v.slaDeadline,
      createdAt: v.createdAt,
      completedAt: v.completedAt,
    };
  }
}
