import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Message } from './entities/message.entity';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
  ) {}

  async saveMessage(
    telegramMessageId: number,
    chatId: string | number,
    telegramUserId: string | number,
    firstName: string,
    sentAt: Date,
    text?: string,
    username?: string,
    lastName?: string,
  ): Promise<void> {
    try {
      const group = await this.groupsService.findByTelegramId(chatId);
      const user = await this.usersService.findOrCreate(
        telegramUserId,
        firstName,
        lastName,
        username,
      );
      if (!group || !user) return;

      const msg = this.messageRepo.create({
        telegramMessageId: String(telegramMessageId),
        groupId: group.id,
        userId: user.id,
        telegramUserId: String(telegramUserId),
        text,
        telegramUsername: username,
        sentAt,
      });
      await this.messageRepo.save(msg);
    } catch (_) {
      // silent – storing messages is non-critical
    }
  }

  async getMessagesByDateRange(
    chatId: string | number,
    from: Date,
    to: Date,
    telegramUserId?: string,
  ): Promise<Message[]> {
    const group = await this.groupsService.findByTelegramId(chatId);
    if (!group) return [];

    const where: any = {
      groupId: group.id,
      sentAt: Between(from, to),
    };

    if (telegramUserId) {
      where.telegramUserId = telegramUserId;
    }

    return this.messageRepo.find({ where, order: { sentAt: 'ASC' } });
  }

  async deleteMessagesFromDb(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await this.messageRepo.delete(ids);
  }
}
