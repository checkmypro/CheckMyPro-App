import {
  Module, Controller, Post, Body, Req, Headers, Injectable,
  BadRequestException, Logger, RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { IsString, IsEnum, IsOptional } from 'class-validator';
import { Request } from 'express';
import { Payment, WebhookEvent } from '@/database/entities/business.entity';
import { Verification, VerificationStatus } from '@/database/entities/verification.entity';
import { User } from '@/database/entities/user.entity';
import { AuditLog } from '@/database/entities/auth.entity';
import { CurrentUser, Public } from '@/common/decorators';

// ── DTOs ──
export class CreatePaymentIntentDto {
  @IsString()
  verificationId: string;
}

export class SubscribeDto {
  @IsOptional() @IsString()
  paymentMethodId?: string;
}

// ── SERVICE ──
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  // In production: private stripe: Stripe;

  constructor(
    @InjectRepository(Payment) private readonly payRepo: Repository<Payment>,
    @InjectRepository(WebhookEvent) private readonly whRepo: Repository<WebhookEvent>,
    @InjectRepository(Verification) private readonly verifRepo: Repository<Verification>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
    private readonly config: ConfigService,
  ) {
    // In production:
    // this.stripe = new Stripe(config.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-04-10' });
  }

  async createPaymentIntent(user: User, dto: CreatePaymentIntentDto) {
    // Verify ownership
    const verif = await this.verifRepo.findOne({
      where: { id: dto.verificationId, userId: user.id },
    });
    if (!verif) throw new BadRequestException('Vérification non trouvée');
    if (verif.status !== VerificationStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Ce dossier a déjà été payé');
    }

    // Determine amount
    const amount = user.isPremium ? 0 : 2999; // 29.99€ in cents

    if (amount === 0) {
      // Premium user: skip payment, mark as paid
      await this.markAsPaid(verif.id, user.id, null, true);
      return { status: 'free', message: 'Vérification gratuite (Premium)' };
    }

    // In production: create Stripe PaymentIntent
    // const intent = await this.stripe.paymentIntents.create({
    //   amount,
    //   currency: 'eur',
    //   customer: user.stripeCustomerId,
    //   metadata: { verificationId: verif.id, userId: user.id },
    // });

    // Create payment record
    const payment = this.payRepo.create({
      userId: user.id,
      verificationId: verif.id,
      amount: amount / 100,
      type: 'one_time',
      status: 'pending',
      stripePaymentId: `pi_simulated_${Date.now()}`, // Replace with intent.id
    });
    await this.payRepo.save(payment);

    this.logger.log(`Payment intent created: ${payment.id} for verification ${verif.id}`);

    return {
      paymentId: payment.id,
      clientSecret: 'pi_simulated_secret', // Replace with intent.client_secret
      amount: amount / 100,
      currency: 'EUR',
    };
  }

  async subscribe(user: User) {
    if (user.isPremium) {
      throw new BadRequestException('Vous êtes déjà Premium');
    }

    // In production: create Stripe subscription
    // const subscription = await this.stripe.subscriptions.create({
    //   customer: user.stripeCustomerId,
    //   items: [{ price: this.config.get('STRIPE_PRICE_PREMIUM') }],
    // });

    const payment = this.payRepo.create({
      userId: user.id,
      amount: 9.99,
      type: 'subscription',
      status: 'completed',
      stripeSubscriptionId: `sub_simulated_${Date.now()}`,
    });
    await this.payRepo.save(payment);

    // Activate Premium
    await this.userRepo.update(user.id, {
      isPremium: true,
      premiumStartedAt: new Date(),
      premiumExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
    });

    await this.auditRepo.save(this.auditRepo.create({
      actorId: user.id,
      action: 'user.premium_subscribed',
      entityType: 'user',
      entityId: user.id,
    }));

    this.logger.log(`User ${user.id} subscribed to Premium`);
    return { status: 'active', message: 'Abonnement Premium activé' };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    // In production: verify Stripe signature
    // const event = this.stripe.webhooks.constructEvent(
    //   rawBody, signature, this.config.get('STRIPE_WEBHOOK_SECRET')
    // );

    // Simulated event for development
    const event = {
      id: `evt_${Date.now()}`,
      type: 'payment_intent.succeeded',
      data: { object: {} },
    };

    // Idempotency check
    const existing = await this.whRepo.findOne({
      where: { provider: 'stripe', externalEventId: event.id },
    });
    if (existing) {
      this.logger.warn(`Duplicate webhook ignored: ${event.id}`);
      return { received: true, duplicate: true };
    }

    // Store webhook event
    const whEvent = this.whRepo.create({
      provider: 'stripe',
      externalEventId: event.id,
      eventType: event.type,
      payload: event.data,
    });
    await this.whRepo.save(whEvent);

    // Process event
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data.object as any);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionCancelled(event.data.object as any);
          break;
        default:
          this.logger.log(`Unhandled webhook type: ${event.type}`);
      }

      await this.whRepo.update(whEvent.id, { processed: true, processedAt: new Date() });
    } catch (error) {
      await this.whRepo.update(whEvent.id, { error: error.message });
      this.logger.error(`Webhook processing failed: ${error.message}`, error.stack);
      throw error;
    }

    return { received: true };
  }

  private async handlePaymentSucceeded(paymentIntent: any) {
    const verificationId = paymentIntent.metadata?.verificationId;
    if (!verificationId) return;

    await this.payRepo.update(
      { stripePaymentId: paymentIntent.id },
      { status: 'completed' },
    );

    await this.markAsPaid(verificationId, paymentIntent.metadata?.userId, paymentIntent.id, false);
  }

  private async handleSubscriptionCancelled(subscription: any) {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    await this.userRepo.update(userId, { isPremium: false });
    this.logger.log(`Premium cancelled for user ${userId}`);
  }

  async markAsPaid(verificationId: string, userId: string, stripePaymentId: string | null, isPremium: boolean) {
    await this.verifRepo.update(verificationId, {
      status: VerificationStatus.PAID,
      isPremiumVerification: isPremium,
      startedAt: new Date(),
    });

    this.logger.log(`Verification ${verificationId} marked as paid`);
  }
}

// ── CONTROLLER ──
@ApiTags('payments')
@Controller('payments')
class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post('create-intent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un PaymentIntent Stripe' })
  async createIntent(@CurrentUser() user: User, @Body() dto: CreatePaymentIntentDto) {
    return this.service.createPaymentIntent(user, dto);
  }

  @Post('subscribe')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Souscrire au Premium' })
  async subscribe(@CurrentUser() user: User) {
    return this.service.subscribe(user);
  }

  @Public()
  @Post('webhooks/stripe')
  @ApiExcludeEndpoint()
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.service.handleStripeWebhook(req.rawBody, signature);
  }
}

// ── MODULE ──
@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, WebhookEvent, Verification, User, AuditLog]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
