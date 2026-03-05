import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { GroupAdmin } from './entities/group-admin.entity';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminsService {
  constructor(
    @InjectRepository(GroupAdmin)
    private readonly adminRepo: Repository<GroupAdmin>,
    @InjectBot() private readonly bot: Telegraf,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
  ) {}

  async reloadAdmins(chatId: string | number): Promise<GroupAdmin[]> {
    const chatAdmins = await this.bot.telegram.getChatAdministrators(chatId);
    const group = await this.groupsService.findByTelegramId(chatId);
    if (!group) return [];

    // Delete old records for this group
    await this.adminRepo.delete({ groupId: group.id });

    const result: GroupAdmin[] = [];
    for (const member of chatAdmins) {
      const tgUser = member.user;
      const user = await this.usersService.findOrCreate(
        tgUser.id,
        tgUser.first_name,
        tgUser.last_name,
        tgUser.username,
      );

      const admin = this.adminRepo.create({
        group,
        groupId: group.id,
        user,
        userId: user.id,
        telegramUserId: String(tgUser.id),
        isOwner: member.status === 'creator',
        canDeleteMessages: (member as any).can_delete_messages ?? false,
        canRestrictMembers: (member as any).can_restrict_members ?? false,
        canManageChat: (member as any).can_manage_chat ?? false,
        canPromoteMembers: (member as any).can_promote_members ?? false,
      });
      await this.adminRepo.save(admin);
      result.push(admin);
    }
    return result;
  }

  async isAdmin(
    chatId: string | number,
    userId: string | number,
  ): Promise<boolean> {
    const group = await this.groupsService.findByTelegramId(chatId);
    if (!group) return false;

    const admin = await this.adminRepo.findOne({
      where: {
        groupId: group.id,
        telegramUserId: String(userId),
      },
    });
    return !!admin;
  }

  async getAdminInfo(
    chatId: string | number,
    userId: string | number,
  ): Promise<GroupAdmin | null> {
    const group = await this.groupsService.findByTelegramId(chatId);
    if (!group) return null;

    return this.adminRepo.findOne({
      where: { groupId: group.id, telegramUserId: String(userId) },
      relations: ['user'],
    });
  }

  async getGroupAdmins(chatId: string | number): Promise<GroupAdmin[]> {
    const group = await this.groupsService.findByTelegramId(chatId);
    if (!group) return [];
    return this.adminRepo.find({
      where: { groupId: group.id },
      relations: ['user'],
    });
  }
}
