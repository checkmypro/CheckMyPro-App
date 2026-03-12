import {
  Injectable, UnauthorizedException, ConflictException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { User, UserRole, UserStatus, ClientType } from '@/database/entities/user.entity';
import { RefreshToken, OtpCode, AuditLog } from '@/database/entities/auth.entity';
import { RegisterDto, LoginDto, VerifyOtpDto } from './dto';
import { JwtPayload } from './strategies/jwt.strategy';

const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 10;
const LOCKOUT_MINUTES = 30;
const OTP_EXPIRY_MINUTES = 10;

/**
 * Parse a duration string like '7d', '24h', '30m' into milliseconds.
 * Supported units: d (days), h (hours), m (minutes), s (seconds).
 * Falls back to `defaultDays` days if parsing fails.
 */
function parseDurationMs(input: string, defaultDays: number): number {
  const match = input.trim().match(/^(\d+)\s*([dhms])$/i);
  if (!match) return defaultDays * 24 * 3600 * 1000;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'd': return value * 24 * 3600 * 1000;
    case 'h': return value * 3600 * 1000;
    case 'm': return value * 60 * 1000;
    case 's': return value * 1000;
    default: return defaultDays * 24 * 3600 * 1000;
  }
}

/** Context passed through every auth operation for traceability */
interface RequestContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepo: Repository<RefreshToken>,
    @InjectRepository(OtpCode)
    private readonly otpRepo: Repository<OtpCode>,
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ════════════════════════════════════
  // REGISTER
  // ════════════════════════════════════
  async register(dto: RegisterDto, ctx: RequestContext = {}) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const referralCode = `CMP-${randomBytes(4).toString('hex').toUpperCase()}`;

    const user = this.usersRepo.create({
      email,
      passwordHash,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      phone: dto.phone || null,
      address: dto.address || null,
      clientType: dto.clientType || ClientType.B2C,
      role: UserRole.USER,
      referralCode,
    });

    await this.usersRepo.save(user);
    await this.generateOtp(email, 'email_verify');
    await this.audit('user.registered', 'user', user.id, null, { email }, ctx);

    this.logger.log(`New user registered: ${email}`);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      message: 'Compte créé. Vérifiez votre email pour le code OTP.',
    };
  }

  // ════════════════════════════════════
  // LOGIN
  // ════════════════════════════════════
  async login(dto: LoginDto, ctx: RequestContext = {}) {
    const email = dto.email.toLowerCase().trim();

    const user = await this.usersRepo.findOne({ where: { email } });

    if (!user) {
      // Timing-safe: still do bcrypt compare to prevent user enumeration
      await bcrypt.compare(dto.password, '$2a$12$dummy.hash.to.prevent.timing.attacks.abcdef');
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Check lock
    if (user.isLocked) {
      await this.audit('user.login_blocked_locked', 'user', user.id, null, null, ctx);
      throw new UnauthorizedException(
        `Compte verrouillé suite à trop de tentatives. Réessayez dans ${LOCKOUT_MINUTES} minutes.`,
      );
    }

    // Check status
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Compte désactivé');
    }

    // Verify password
    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      user.failedLoginCount += 1;
      if (user.failedLoginCount >= MAX_LOGIN_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        this.logger.warn(`Account locked: ${email} after ${MAX_LOGIN_ATTEMPTS} failed attempts`);
      }
      await this.usersRepo.save(user);
      await this.audit('user.login_failed', 'user', user.id, null, { failedCount: user.failedLoginCount }, ctx);
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Check email verified
    if (!user.emailVerified) {
      throw new UnauthorizedException('Veuillez vérifier votre email avant de vous connecter');
    }

    // Success — reset failed attempts
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    user.loginCount += 1;
    await this.usersRepo.save(user);

    const tokens = await this.generateTokens(user, ctx);
    await this.audit('user.logged_in', 'user', user.id, null, null, ctx);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  // ════════════════════════════════════
  // VERIFY OTP
  // ════════════════════════════════════
  async verifyOtp(dto: VerifyOtpDto, ctx: RequestContext = {}) {
    const email = dto.email.toLowerCase().trim();

    const otp = await this.otpRepo.findOne({
      where: { email, purpose: 'email_verify' },
      order: { createdAt: 'DESC' },
    });

    if (!otp) {
      throw new BadRequestException('Aucun code OTP trouvé pour cet email');
    }

    if (otp.isExpired) {
      throw new BadRequestException('Code OTP expiré. Demandez un nouveau code.');
    }

    if (otp.isUsed) {
      throw new BadRequestException('Ce code a déjà été utilisé.');
    }

    if (!otp.hasRemainingAttempts) {
      throw new BadRequestException('Trop de tentatives. Demandez un nouveau code.');
    }

    const codeHash = createHash('sha256').update(dto.code).digest('hex');
    if (codeHash !== otp.codeHash) {
      otp.attempts += 1;
      await this.otpRepo.save(otp);
      throw new BadRequestException('Code OTP incorrect');
    }

    otp.usedAt = new Date();
    await this.otpRepo.save(otp);

    await this.usersRepo.update({ email }, { emailVerified: true });
    await this.audit('user.email_verified', 'user', null, null, { email }, ctx);

    return { verified: true, message: 'Email vérifié avec succès' };
  }

  // ════════════════════════════════════
  // RESEND OTP
  // ════════════════════════════════════
  async resendOtp(email: string, ctx: RequestContext = {}) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.usersRepo.findOne({ where: { email: normalizedEmail } });
    if (!user) {
      // Don't reveal if email exists
      return { message: 'Si ce compte existe, un code a été envoyé.' };
    }

    // Rate limit: max 3 OTP per hour
    const oneHourAgo = new Date(Date.now() - 3600000);
    const recentCount = await this.otpRepo.count({
      where: { email: normalizedEmail, createdAt: MoreThan(oneHourAgo) },
    });

    if (recentCount >= 3) {
      throw new BadRequestException('Trop de demandes. Réessayez dans 1 heure.');
    }

    await this.generateOtp(normalizedEmail, 'email_verify');
    await this.audit('user.otp_resent', 'user', user.id, null, null, ctx);

    return { message: 'Code envoyé' };
  }

  // ════════════════════════════════════
  // REFRESH TOKEN
  // ════════════════════════════════════
  async refreshAccessToken(refreshToken: string, ctx: RequestContext = {}) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const stored = await this.refreshTokensRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!stored || !stored.isValid) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    const user = stored.user;
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Compte désactivé');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_ACCESS_EXPIRATION', '15m'),
    });

    return { accessToken };
  }

  // ════════════════════════════════════
  // LOGOUT
  // ════════════════════════════════════
  async logout(userId: string, refreshToken?: string, ctx: RequestContext = {}) {
    if (refreshToken) {
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      await this.refreshTokensRepo.update(
        { tokenHash, userId },
        { revokedAt: new Date() },
      );
    }
    await this.audit('user.logged_out', 'user', userId, null, null, ctx);
    return { message: 'Déconnecté' };
  }

  // ════════════════════════════════════
  // PRIVATE — TOKEN GENERATION
  // ════════════════════════════════════
  private async generateTokens(user: User, ctx: RequestContext) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_ACCESS_EXPIRATION', '15m'),
    });

    // Generate refresh token
    const rawRefreshToken = randomBytes(64).toString('hex');
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    // Parse expiration properly — supports '7d', '24h', '30d', etc.
    const refreshDuration = this.config.get('JWT_REFRESH_EXPIRATION', '7d');
    const expiresMs = parseDurationMs(refreshDuration, 7);
    const expiresAt = new Date(Date.now() + expiresMs);

    const refreshTokenEntity = this.refreshTokensRepo.create({
      userId: user.id,
      tokenHash,
      deviceFingerprint: ctx.userAgent?.substring(0, 255) || null,
      ipAddress: ctx.ip || null,
      expiresAt,
    });
    await this.refreshTokensRepo.save(refreshTokenEntity);

    return { accessToken, refreshToken: rawRefreshToken };
  }

  // ════════════════════════════════════
  // PRIVATE — OTP
  // ════════════════════════════════════
  private async generateOtp(email: string, purpose: 'email_verify' | 'password_reset') {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');

    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const otp = this.otpRepo.create({ email, codeHash, purpose, expiresAt });
    await this.otpRepo.save(otp);

    // TODO: Enqueue email via NotificationWorker
    // For development: log the code
    if (this.config.get('NODE_ENV') !== 'production') {
      this.logger.debug(`[DEV] OTP for ${email}: ${code}`);
    }

    return code;
  }

  // ════════════════════════════════════
  // PRIVATE — AUDIT (IP + UA on every call)
  // ════════════════════════════════════
  private async audit(
    action: string,
    entityType: string | null,
    entityId: string | null,
    oldValue: Record<string, any> | null,
    newValue: Record<string, any> | null,
    ctx: RequestContext = {},
  ) {
    const log = this.auditRepo.create({
      action,
      entityType,
      entityId,
      oldValue,
      newValue,
      ipAddress: ctx.ip || null,
      userAgent: ctx.userAgent || null,
    });
    await this.auditRepo.save(log);
  }

  // ════════════════════════════════════
  // PRIVATE — SANITIZE USER OUTPUT
  // ════════════════════════════════════
  private sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
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
