import {
  Controller, Get, Post, Body, Param, Query,
  Req, ParseUUIDPipe, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { VerificationsService } from './verifications.service';
import { CreateVerificationDto, ListVerificationsDto } from './dto';
import { CurrentUser } from '@/common/decorators';
import { User } from '@/database/entities/user.entity';

@ApiTags('verifications')
@ApiBearerAuth()
@Controller('verifications')
export class VerificationsController {
  constructor(private readonly service: VerificationsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une vérification' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateVerificationDto,
  ) {
    // Passes userId + clientType extracted from the authenticated user
    return this.service.create(user.id, dto, user.clientType);
  }

  @Get()
  @ApiOperation({ summary: 'Lister mes vérifications' })
  async list(
    @CurrentUser() user: User,
    @Query() dto: ListVerificationsDto,
  ) {
    return this.service.listForUser(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'une vérification' })
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // userId passed for ownership check inside the service
    return this.service.getById(id, user.id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Timeline d\'événements du dossier' })
  async getTimeline(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // First verify ownership, then fetch timeline
    await this.service.getById(id, user.id);
    return this.service.getTimeline(id);
  }
}
