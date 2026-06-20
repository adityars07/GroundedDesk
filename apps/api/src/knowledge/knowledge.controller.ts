import {
  Controller,
  Post,
  Get,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.knowledgeService.uploadFile(user.tenantId, file);
  }

  @Post('crawl')
  async crawlUrl(
    @CurrentUser() user: any,
    @Body('url') url: string,
    @Body('name') name: string,
  ) {
    return this.knowledgeService.crawlUrl(user.tenantId, url, name);
  }

  @Get()
  async listSources(
    @CurrentUser() user: any,
    @Query('status') status?: string,
  ) {
    return this.knowledgeService.listSources(user.tenantId, status);
  }

  @Get(':id')
  async getSource(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.knowledgeService.getSource(user.tenantId, id);
  }

  @Get(':id/history')
  async getSourceHistory(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.knowledgeService.getSourceHistory(user.tenantId, id);
  }

  @Get(':id/chunks')
  async getSourceChunks(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.knowledgeService.getSourceChunks(user.tenantId, id, page, limit);
  }

  @Delete(':id')
  async deleteSource(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.knowledgeService.deleteSource(user.tenantId, id);
  }
}
