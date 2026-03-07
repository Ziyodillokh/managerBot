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

@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint', unique: true })
  telegramId: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'varchar', nullable: true })
  username: string | null;

  @Column({ default: 'supergroup' })
  type: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => GroupAdmin, (admin) => admin.group)
  admins: GroupAdmin[];

  @OneToMany(() => Message, (msg) => msg.group)
  messages: Message[];
}
