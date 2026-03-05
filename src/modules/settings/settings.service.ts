import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupSettings } from './entities/group-settings.entity';
import { GroupsService } from '../groups/groups.service';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(GroupSettings)
    private readonly settingsRepo: Repository<GroupSettings>,
    private readonly groupsService: GroupsService,
  ) {}

  async getOrCreate(chatId: string | number): Promise<GroupSettings> {
    const group = await this.groupsService.findByTelegramId(chatId);
    if (!group) throw new Error('Group not found');

    let settings = await this.settingsRepo.findOne({
      where: { groupId: group.id },
    });
    if (!settings) {
      settings = this.settingsRepo.create({ groupId: group.id, group });
      await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async toggle(
    chatId: string | number,
    key:
      | 'muteEnabled'
      | 'deleteEnabled'
      | 'welcomeEnabled'
      | 'antiSpamEnabled'
      | 'antiFloodEnabled',
  ): Promise<GroupSettings> {
    const settings = await this.getOrCreate(chatId);
    settings[key] = !settings[key];
    return this.settingsRepo.save(settings);
  }

  async get(chatId: string | number): Promise<GroupSettings | null> {
    const group = await this.groupsService.findByTelegramId(chatId);
    if (!group) return null;
    return this.settingsRepo.findOne({ where: { groupId: group.id } });
  }
}
