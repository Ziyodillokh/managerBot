import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('protected_users')
@Index(['ownerTelegramId', 'username'], { unique: true })
export class ProtectedUser {
  @PrimaryGeneratedColumn()
  id: number;

  /** Telegram ID of the owner who added this protected user */
  @Column({ type: 'bigint' })
  ownerTelegramId: string;

  /** Username (without @) whose messages are never deleted */
  @Column({ length: 64 })
  username: string;

  @CreateDateColumn()
  createdAt: Date;
}
