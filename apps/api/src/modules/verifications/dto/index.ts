import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsNumber, IsEnum, IsUUID,
  MaxLength, Min, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Urgency } from '@/database/entities/verification.entity';

export class CreateVerificationDto {
  @ApiProperty({ description: 'Nom de l\'entreprise du pro' })
  @IsString()
  @MaxLength(255)
  proCompanyName: string;

  @ApiPropertyOptional({ description: 'SIRET du pro (14 chiffres)' })
  @IsOptional()
  @IsString()
  @MaxLength(14)
  proSiret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  quoteAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  quoteDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workCity?: string;

  @ApiPropertyOptional({ enum: Urgency, default: Urgency.STANDARD })
  @IsOptional()
  @IsEnum(Urgency)
  urgency?: Urgency;
}

export class ListVerificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 25;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class AdminListCasesDto extends ListVerificationsDto {
  @IsOptional()
  @IsString()
  urgency?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsUUID()
  operatorId?: string;

  @IsOptional()
  @IsString()
  clientType?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

export class UpdateCaseStatusDto {
  @ApiProperty()
  @IsString()
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class AssignOperatorDto {
  @ApiProperty()
  @IsUUID()
  operatorId: string;
}

export class ValidateCaseDto {
  @ApiProperty()
  checklistAdmin: boolean;

  @ApiProperty()
  checklistInsurance: boolean;

  @ApiProperty()
  checklistMorality: boolean;

  @ApiProperty()
  checklistSeniority: boolean;

  @ApiProperty()
  checklistBonus: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  operatorNotes?: string;

  @ApiPropertyOptional({ description: 'Score override (if operator adjusts)' })
  @IsOptional()
  @IsNumber()
  scoreOverride?: number;
}
