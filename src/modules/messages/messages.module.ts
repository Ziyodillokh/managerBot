import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './entities/message.entity';
import { MessagesService } from './messages.service';
import { GroupsModule } from '../groups/groups.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Message]), GroupsModule, UsersModule],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
