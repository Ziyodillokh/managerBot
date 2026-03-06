import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findOrCreate(
    telegramId: string | number,
    firstName: string,
    lastName?: string,
    username?: string,
  ): Promise<User> {
    const tid = String(telegramId);
    let user = await this.userRepo.findOne({ where: { telegramId: tid } });
    if (!user) {
      user = this.userRepo.create({
        telegramId: tid,
        firstName,
        lastName,
        username,
      });
      return this.userRepo.save(user);
    }
    // Only update if something actually changed
    let changed = false;
    if (user.firstName !== firstName) {
      user.firstName = firstName;
      changed = true;
    }
    if (lastName !== undefined && user.lastName !== lastName) {
      user.lastName = lastName;
      changed = true;
    }
    if (username !== undefined && user.username !== username) {
      user.username = username;
      changed = true;
    }
    if (changed) await this.userRepo.save(user);
    return user;
  }

  async findByTelegramId(telegramId: string | number): Promise<User | null> {
    return this.userRepo.findOne({ where: { telegramId: String(telegramId) } });
  }

  async findByUsername(username: string): Promise<User | null> {
    const clean = username.startsWith('@') ? username.slice(1) : username;
    return this.userRepo.findOne({ where: { username: clean } });
  }

  /**
   * Persist user's language choice to DB so it survives bot restarts.
   */
  async setLang(telegramId: string | number, lang: string): Promise<void> {
    await this.userRepo.update({ telegramId: String(telegramId) }, { lang });
  }

  /**
   * Returns the persisted language choice, or null if the user has not
   * explicitly set one yet (first-time user — show language selector).
   */
  async getLang(telegramId: string | number): Promise<string | null> {
    const user = await this.userRepo.findOne({
      where: { telegramId: String(telegramId) },
      select: ['lang'],
    });
    return user?.lang ?? null;
  }
}
