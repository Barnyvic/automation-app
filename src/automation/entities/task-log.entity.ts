import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

export type TaskStatus = 'SUCCESS' | 'FAILED';

@Entity('task_logs')
export class TaskLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => UserEntity, (user) => user.taskLogs, { onDelete: 'CASCADE' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 100 })
  taskType!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: TaskStatus;

  @Column({ type: 'text', nullable: true })
  message?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

