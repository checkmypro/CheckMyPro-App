import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsString, MinLength, MaxLength, IsOptional,
  Matches, IsEnum,
} from 'class-validator';
import { ClientType } from '@/database/entities/user.entity';

export class RegisterDto {
  @ApiProperty({ example: 'jean.dupont@email.com' })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({ example: 'SecureP@ss123' })
  @IsString()
  @MinLength(8, { message: 'Mot de passe : minimum 8 caractères' })
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Mot de passe : au moins 1 majuscule, 1 minuscule, 1 chiffre',
  })
  password: string;

  @ApiProperty({ example: 'Jean' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Dupont' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ example: '0612345678' })
  @IsOptional()
  @IsString()
  @Matches(/^(\+33|0)[1-9]\d{8}$/, { message: 'Numéro de téléphone français invalide' })
  phone?: string;

  @ApiPropertyOptional({ example: '13080 Aix-en-Provence' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ enum: ClientType, default: ClientType.B2C })
  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;
}

export class LoginDto {
  @ApiProperty({ example: 'jean.dupont@email.com' })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({ example: 'SecureP@ss123' })
  @IsString()
  @MinLength(1)
  password: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'jean.dupont@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'Le code OTP doit contenir 6 chiffres' })
  code: string;
}

export class ResendOtpDto {
  @ApiProperty({ example: 'jean.dupont@email.com' })
  @IsEmail()
  email: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'jean.dupont@email.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  password: string;
}
