import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './entities/group.entity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
  ) {}

  async findOrCreate(
    telegramId: string | number,
    title: string,
    type: string,
    username?: string,
  ): Promise<Group> {
    const tid = String(telegramId);
    let group = await this.groupRepo.findOne({ where: { telegramId: tid } });
    if (!group) {
      group = this.groupRepo.create({ telegramId: tid, title, type, username });
      await this.groupRepo.save(group);
    } else if (group.title !== title || group.username !== username) {
      group.title = title;
      if (username) group.username = username;
      await this.groupRepo.save(group);
    }
    return group;
  }

  async findByTelegramId(telegramId: string | number): Promise<Group | null> {
    return this.groupRepo.findOne({
      where: { telegramId: String(telegramId) },
    });
  }

  async findById(id: number): Promise<Group | null> {
    return this.groupRepo.findOne({ where: { id } });
  }
}
