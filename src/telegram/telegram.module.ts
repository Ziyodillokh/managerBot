import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { GroupsModule } from '../modules/groups/groups.module';
import { UsersModule } from '../modules/users/users.module';
import { MessagesModule } from '../modules/messages/messages.module';

@Module({
  imports: [
    GroupsModule,
    UsersModule,
    MessagesModule,
  ],
  providers: [TelegramUpdate],
})
export class TelegramModule {}
