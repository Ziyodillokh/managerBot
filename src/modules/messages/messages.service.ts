import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Message } from './entities/message.entity';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

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
    } catch (err) {
      this.logger.warn(`saveMessage failed: ${(err as Error).message}`);
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
    // Delete in chunks to avoid "too many bind variables" on large sets
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      await this.messageRepo.delete({ id: In(chunk) });
    }
  }
}
