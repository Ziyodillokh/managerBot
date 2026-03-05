import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from './entities/group.entity';
import { GroupsService } from './groups.service';

@Module({
  imports: [TypeOrmModule.forFeature([Group])],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
