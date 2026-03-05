import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { AdminsModule } from '../modules/admins/admins.module';
import { GroupsModule } from '../modules/groups/groups.module';
import { UsersModule } from '../modules/users/users.module';
import { SettingsModule } from '../modules/settings/settings.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { AdminGuard } from '../common/guards/admin.guard';

@Module({
  imports: [
    AdminsModule,
    GroupsModule,
    UsersModule,
    SettingsModule,
    MessagesModule,
  ],
  providers: [TelegramUpdate, AdminGuard],
})
export class TelegramModule {}
