import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationService } from './automation.service';
import { AutomationResolver } from './automation.resolver';
import { TaskLog } from './entities/task-log.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([TaskLog]), UsersModule],
  providers: [AutomationService, AutomationResolver],
})
export class AutomationModule {}

