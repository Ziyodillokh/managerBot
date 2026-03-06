import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Group } from '../../groups/entities/group.entity';
import { User } from '../../users/entities/user.entity';

@Entity('group_admins')
export class GroupAdmin {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Group, (group) => group.admins, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: Group;

  @Column()
  groupId: number;

  @ManyToOne(() => User, (user) => user.adminships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ type: 'bigint' })
  telegramUserId: string;

  @Column({ default: false })
  isOwner: boolean;

  /** Whether this admin has been granted delete-message access by the owner */
  @Column({ default: false })
  hasDeleteAccess: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
