import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupAdmin } from './entities/group-admin.entity';
import { ProtectedUser } from './entities/protected-user.entity';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminsService {
  constructor(
    @InjectRepository(GroupAdmin)
    private readonly adminRepo: Repository<GroupAdmin>,
    @InjectRepository(ProtectedUser)
    private readonly protectedRepo: Repository<ProtectedUser>,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
  ) {}

  // ─── Admin / Access management ──────────────────────────────────────────

  /** Save or update an admin record for a group */
  async saveAdmin(
    groupId: number,
    userId: number,
    telegramUserId: string,
    isOwner: boolean,
  ): Promise<GroupAdmin> {
    let admin = await this.adminRepo.findOne({
      where: { groupId, telegramUserId },
    });
    if (!admin) {
      admin = this.adminRepo.create({
        groupId,
        userId,
        telegramUserId,
        isOwner,
        hasDeleteAccess: isOwner, // owners get access automatically
      });
    } else {
      admin.isOwner = isOwner;
      if (isOwner) admin.hasDeleteAccess = true;
    }
    return this.adminRepo.save(admin);
  }

  /** Grant delete access to a user for a group */
  async grantDeleteAccess(
    groupTelegramId: string,
    telegramUserId: string,
  ): Promise<void> {
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    if (!group) return;
    await this.adminRepo.update(
      { groupId: group.id, telegramUserId },
      { hasDeleteAccess: true },
    );
  }

  /** Revoke delete access from a user for a group */
  async revokeDeleteAccess(
    groupTelegramId: string,
    telegramUserId: string,
  ): Promise<void> {
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    if (!group) return;
    await this.adminRepo.update(
      { groupId: group.id, telegramUserId },
      { hasDeleteAccess: false },
    );
  }

  /** Check if user has access (owner always has, others need hasDeleteAccess) */
  async hasAccess(
    groupTelegramId: string,
    telegramUserId: string,
  ): Promise<boolean> {
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    if (!group) return false;
    const admin = await this.adminRepo.findOne({
      where: { groupId: group.id, telegramUserId },
    });
    if (!admin) return false;
    return admin.isOwner || admin.hasDeleteAccess;
  }

  /** Check if user is owner of at least one group */
  async isOwnerOfAny(telegramUserId: string): Promise<boolean> {
    const count = await this.adminRepo.count({
      where: { telegramUserId, isOwner: true },
    });
    return count > 0;
  }

  /** Get groups where user is owner */
  async getOwnerGroups(telegramUserId: string): Promise<GroupAdmin[]> {
    return this.adminRepo.find({
      where: { telegramUserId, isOwner: true },
      relations: ['group'],
    });
  }

  /** Get users with access for a group (for access management UI) */
  async getGroupAccessList(groupTelegramId: string): Promise<GroupAdmin[]> {
    const group = await this.groupsService.findByTelegramId(groupTelegramId);
    if (!group) return [];
    return this.adminRepo.find({
      where: { groupId: group.id, hasDeleteAccess: true },
      relations: ['user'],
    });
  }

  // ─── Protected users ───────────────────────────────────────────────────

  async addProtectedUser(
    ownerTelegramId: string,
    username: string,
    telegramUserId?: string,
  ): Promise<ProtectedUser | null> {
    const clean = username.startsWith('@') ? username.slice(1) : username;
    const existing = await this.protectedRepo.findOne({
      where: { ownerTelegramId, username: clean },
    });
    if (existing) return null; // already exists
    const pu = this.protectedRepo.create({
      ownerTelegramId,
      username: clean,
      telegramUserId: telegramUserId ?? null,
    });
    return this.protectedRepo.save(pu);
  }

  async removeProtectedUser(
    ownerTelegramId: string,
    username: string,
  ): Promise<boolean> {
    const clean = username.startsWith('@') ? username.slice(1) : username;
    const result = await this.protectedRepo.delete({
      ownerTelegramId,
      username: clean,
    });
    return (result.affected ?? 0) > 0;
  }

  async getProtectedUsers(ownerTelegramId: string): Promise<ProtectedUser[]> {
    return this.protectedRepo.find({
      where: { ownerTelegramId },
      order: { createdAt: 'ASC' },
    });
  }

  async getProtectedUsernames(ownerTelegramId: string): Promise<string[]> {
    const list = await this.getProtectedUsers(ownerTelegramId);
    return list.map((p) => p.username);
  }
}
