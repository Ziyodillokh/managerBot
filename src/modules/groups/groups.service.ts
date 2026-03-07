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
      try {
        group = this.groupRepo.create({ telegramId: tid, title, type, username });
        await this.groupRepo.save(group);
      } catch (err: any) {
        if (err?.code === '23505') {
          group = await this.groupRepo.findOne({ where: { telegramId: tid } });
          if (group) return group;
        }
        throw err;
      }
    } else {
      let dirty = false;
      if (!group.isActive) {
        group.isActive = true;
        dirty = true;
      }
      if (group.title !== title) {
        group.title = title;
        dirty = true;
      }
      if (group.username !== (username ?? null)) {
        group.username = username ?? null;
        dirty = true;
      }
      if (dirty) await this.groupRepo.save(group);
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

  async getActiveGroups(): Promise<Group[]> {
    return this.groupRepo.find({
      where: { isActive: true },
      order: { title: 'ASC' },
    });
  }

  async deactivate(telegramId: string | number): Promise<void> {
    await this.groupRepo.update(
      { telegramId: String(telegramId) },
      { isActive: false },
    );
  }
}
