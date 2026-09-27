/* eslint-disable prettier/prettier */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CronConfig } from 'src/schemas/cron-config.schema';
import { CronLog } from 'src/schemas/cron-log.schema';
import { TasksService } from 'src/tasks/tasks.service';

@Controller('crons')
export class CronsController {
  constructor(
    private readonly tasksService: TasksService,
    @InjectModel(CronConfig.name) private cronConfigModel: Model<CronConfig>,
    @InjectModel(CronLog.name) private cronLogModel: Model<CronLog>,
  ) {}

  @Get()
  async getCrons() {
    const configs = await this.cronConfigModel.find().exec();
    
    const result = await Promise.all(
      configs.map(async (config) => {
        const lastLog = (await this.cronLogModel.findOne({ name: config.name }).sort({ createdAt: -1 }).exec())?.toObject();
        return {
          name: config.name,
          type: config.type,
          cronExpression: config.cronExpression,
          data: config.data,
          isActive: config.isActive,
          lastLog: lastLog ? {
            status: lastLog.status,
            createdAt: lastLog.createdAt,
            durationMs: lastLog.durationMs,
          } : null,
        };
      })
    );
    
    return result;
  }

  @Patch(':name')
  async updateCron(
    @Param('name') name: string,
    @Body() body: { cronExpression: string; isActive: boolean; data?: any },
  ) {
    return await this.tasksService.updateCronJob(name, body.cronExpression, body.isActive, body.data);
  }

  @Post()
  async createCron(
    @Body() body: { name: string; type: string; cronExpression: string; data: any; isActive?: boolean },
  ) {
    return await this.tasksService.createCronJob(
      body.name,
      body.type,
      body.cronExpression,
      body.data,
      body.isActive ?? true
    );
  }

  @Delete(':name')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCron(@Param('name') name: string) {
    await this.tasksService.deleteCronJob(name);
  }

  @Post('reinit/system')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reinitCrons() {
    await this.tasksService.reinitCronJobs();
  }

  @Post(':name/trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerCron(@Param('name') name: string) {
    const config = await this.cronConfigModel.findOne({ name });
    if (!config) throw new NotFoundException('Cron job not found');
    this.tasksService.triggerCronJob(name).catch(() => {});
  }

  @Get(':name/logs')
  async getCronLogs(@Param('name') name: string) {
    const logs = await this.cronLogModel
      .find({ name })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
    return logs;
  }
}
