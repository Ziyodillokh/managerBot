import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Group } from '../../groups/entities/group.entity';
import { User } from '../../users/entities/user.entity';

@Entity('messages')
@Index(['groupId', 'sentAt'])
@Index(['groupId', 'userId', 'sentAt'])
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  telegramMessageId: string;

  @ManyToOne(() => Group, (group) => group.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: Group;

  @Column()
  groupId: number;

  @ManyToOne(() => User, (user) => user.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ type: 'bigint' })
  telegramUserId: string;

  @Column({ nullable: true, length: 4096 })
  text: string;

  @Column({ nullable: true })
  telegramUsername: string;

  @Column({ type: 'timestamptz' })
  sentAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
