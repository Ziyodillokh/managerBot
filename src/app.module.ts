import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegrafModule } from 'nestjs-telegraf';
import configuration from './config/configuration';
import { TelegramModule } from './telegram/telegram.module';
import { GroupsModule } from './modules/groups/groups.module';
import { UsersModule } from './modules/users/users.module';
import { AdminsModule } from './modules/admins/admins.module';
import { MessagesModule } from './modules/messages/messages.module';
import { Group } from './modules/groups/entities/group.entity';
import { User } from './modules/users/entities/user.entity';
import { GroupAdmin } from './modules/admins/entities/group-admin.entity';
import { ProtectedUser } from './modules/admins/entities/protected-user.entity';
import { Message } from './modules/messages/entities/message.entity';

@Module({
  imports: [
    // ─── Config ───────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // ─── Database ─────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        entities: [Group, User, GroupAdmin, ProtectedUser, Message],
        synchronize: true,
        logging: config.get<string>('nodeEnv') === 'development',
        ssl: false,
      }),
    }),

    // ─── Telegram Bot ─────────────────────────────────────────────
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        token: config.get<string>('telegram.botToken')!,
        middlewares: [],
      }),
    }),

    // ─── Feature Modules ──────────────────────────────────────────
    GroupsModule,
    UsersModule,
    AdminsModule,
    MessagesModule,
    TelegramModule,
  ],
})
export class AppModule {}
