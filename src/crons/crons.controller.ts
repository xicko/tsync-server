/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable prettier/prettier */
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
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

  @Put(':name')
  async updateCron(
    @Param('name') name: string,
    @Body() body: { cronExpression: string; isActive: boolean; data?: any },
  ) {
    await this.tasksService.updateCronJob(name, body.cronExpression, body.isActive, body.data);
    return { success: true };
  }

  @Post()
  async createCron(
    @Body() body: { name: string; type: string; cronExpression: string; data: any; isActive?: boolean },
  ) {
    await this.tasksService.createCronJob(
      body.name,
      body.type,
      body.cronExpression,
      body.data,
      body.isActive ?? true
    );
    return { success: true };
  }

  @Delete(':name')
  async deleteCron(@Param('name') name: string) {
    await this.tasksService.deleteCronJob(name);
    return { success: true };
  }

  @Post('reinit/system')
  async reinitCrons() {
    await this.tasksService.reinitCronJobs();
    return { success: true };
  }

  @Post(':name/trigger')
  async triggerCron(@Param('name') name: string) {
    this.tasksService.triggerCronJob(name).catch(() => {});
    return { success: true };
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
