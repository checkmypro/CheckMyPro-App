import {
  Controller, Post, Body, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto, LoginDto, VerifyOtpDto, ResendOtpDto,
  RefreshTokenDto,
} from './dto';
import { Public, CurrentUser } from '@/common/decorators';
import { User } from '@/database/entities/user.entity';

/** Extract IP and user-agent from request — used for audit trail */
function extractContext(req: Request) {
  return {
    ip: req.ip || req.socket?.remoteAddress || undefined,
    userAgent: req.get('user-agent') || undefined,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Inscription client' })
  @ApiResponse({ status: 201, description: 'Compte créé, OTP envoyé' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, extractContext(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion' })
  @ApiResponse({ status: 200, description: 'Tokens retournés' })
  @ApiResponse({ status: 401, description: 'Identifiants incorrects' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, extractContext(req));
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifier email via OTP' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.authService.verifyOtp(dto, extractContext(req));
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renvoyer OTP' })
  async resendOtp(@Body() dto: ResendOtpDto, @Req() req: Request) {
    return this.authService.resendOtp(dto.email, extractContext(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraîchir access token' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refreshAccessToken(dto.refreshToken, extractContext(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion' })
  async logout(
    @CurrentUser() user: User,
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ) {
    return this.authService.logout(user.id, dto.refreshToken, extractContext(req));
  }
}
