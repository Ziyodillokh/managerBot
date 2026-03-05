import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { GroupAdmin } from '../../admins/entities/group-admin.entity';
import { Message } from '../../messages/entities/message.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint', unique: true })
  telegramId: string;

  @Column({ nullable: true, length: 64 })
  username: string;

  @Column({ length: 255 })
  firstName: string;

  @Column({ nullable: true, length: 255 })
  lastName: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => GroupAdmin, (admin) => admin.user, { cascade: true })
  adminships: GroupAdmin[];

  @OneToMany(() => Message, (msg) => msg.user)
  messages: Message[];
}
