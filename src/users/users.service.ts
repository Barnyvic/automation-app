import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async create(input: CreateUserInput): Promise<UserEntity> {
    this.logger.log(`Creating user email=${input.email}`);
    const existing = await this.userRepository.findOne({
      where: { email: input.email },
    });
    if (existing) {
      this.logger.warn(`Attempt to create existing email=${input.email}`);
      throw new ConflictException('Email already in use');
    }
    const passwordHash = await bcrypt.hash(input.password, 10);
    const entity = this.userRepository.create({
      email: input.email,
      name: input.name,
      passwordHash,
    });
    const saved = await this.userRepository.save(entity);
    this.logger.log(`Created user id=${saved.id} email=${saved.email}`);
    return saved;
  }

  async findAll(): Promise<UserEntity[]> {
    this.logger.debug('Fetching all users');
    return this.userRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<UserEntity> {
    this.logger.debug(`Fetching user id=${id}`);
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      this.logger.warn(`User not found id=${id}`);
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    this.logger.debug(`Fetching user by email=${email}`);
    return this.userRepository.findOne({ where: { email } });
  }

  async update(input: UpdateUserInput): Promise<UserEntity> {
    this.logger.log(`Updating user id=${input.id}`);
    const user = await this.findById(input.id);
    if (input.email && input.email !== user.email) {
      const exists = await this.userRepository.findOne({
        where: { email: input.email },
      });
      if (exists) {
        this.logger.warn(
          `Attempt to change email to an existing one email=${input.email}`,
        );
        throw new ConflictException('Email already in use');
      }
      user.email = input.email;
    }
    if (input.name) {
      user.name = input.name;
    }
    if (input.password) {
      user.passwordHash = await bcrypt.hash(input.password, 10);
    }
    const saved = await this.userRepository.save(user);
    this.logger.log(`Updated user id=${saved.id}`);
    return saved;
  }

  async remove(id: string): Promise<boolean> {
    this.logger.log(`Removing user id=${id}`);
    const result = await this.userRepository.delete(id);
    const ok = result.affected === 1;
    this.logger.log(`Removed user id=${id} ok=${ok}`);
    return ok;
  }

  async resetPassword(id: string, newPassword: string): Promise<UserEntity> {
    this.logger.log(`Resetting password for user id=${id}`);
    const user = await this.findById(id);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    const saved = await this.userRepository.save(user);
    this.logger.log(`Password reset for user id=${saved.id}`);
    return saved;
  }

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<UserEntity> {
    this.logger.log(`Changing password for user id=${id}`);
    const user = await this.findById(id);
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      this.logger.warn(`Invalid current password for user id=${id}`);
      throw new UnauthorizedException('Invalid current password');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    const saved = await this.userRepository.save(user);
    this.logger.log(`Password changed for user id=${saved.id}`);
    return saved;
  }
}
