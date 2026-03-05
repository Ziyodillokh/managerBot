import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupSettings } from './entities/group-settings.entity';
import { SettingsService } from './settings.service';
import { GroupsModule } from '../groups/groups.module';

@Module({
  imports: [TypeOrmModule.forFeature([GroupSettings]), GroupsModule],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
