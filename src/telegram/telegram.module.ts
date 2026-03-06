import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { MtprotoService } from './mtproto.service';
import { GroupsModule } from '../modules/groups/groups.module';
import { UsersModule } from '../modules/users/users.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { AdminsModule } from '../modules/admins/admins.module';

@Module({
  imports: [GroupsModule, UsersModule, MessagesModule, AdminsModule],
  providers: [TelegramUpdate, MtprotoService],
  exports: [MtprotoService],
})
export class TelegramModule {}
