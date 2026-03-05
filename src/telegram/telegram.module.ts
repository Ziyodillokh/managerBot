import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { MtprotoService } from './mtproto.service';
import { GroupsModule } from '../modules/groups/groups.module';
import { UsersModule } from '../modules/users/users.module';
import { MessagesModule } from '../modules/messages/messages.module';

@Module({
  imports: [GroupsModule, UsersModule, MessagesModule],
  providers: [TelegramUpdate, MtprotoService],
  exports: [MtprotoService],
})
export class TelegramModule {}
