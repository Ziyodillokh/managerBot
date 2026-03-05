import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Group } from '../../groups/entities/group.entity';

@Entity('group_settings')
export class GroupSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Group, (group) => group.settings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: Group;

  @Column({ unique: true })
  groupId: number;

  @Column({ default: true })
  muteEnabled: boolean;

  @Column({ default: true })
  deleteEnabled: boolean;

  @Column({ default: true })
  welcomeEnabled: boolean;

  @Column({ default: false })
  antiSpamEnabled: boolean;

  @Column({ default: false })
  antiFloodEnabled: boolean;

  @Column({ type: 'jsonb', default: '{}' })
  extra: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
