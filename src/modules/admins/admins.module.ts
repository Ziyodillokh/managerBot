import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupAdmin } from './entities/group-admin.entity';
import { ProtectedUser } from './entities/protected-user.entity';
import { AdminsService } from './admins.service';
import { GroupsModule } from '../groups/groups.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GroupAdmin, ProtectedUser]),
    GroupsModule,
    UsersModule,
  ],
  providers: [AdminsService],
  exports: [AdminsService],
})
export class AdminsModule {}
