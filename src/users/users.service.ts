import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async create(input: CreateUserInput): Promise<UserEntity> {
    const existing = await this.userRepository.findOne({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }
    const passwordHash = await bcrypt.hash(input.password, 10);
    const entity = this.userRepository.create({
      email: input.email,
      name: input.name,
      passwordHash,
    });
    return this.userRepository.save(entity);
  }

  async findAll(): Promise<UserEntity[]> {
    return this.userRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async update(input: UpdateUserInput): Promise<UserEntity> {
    const user = await this.findById(input.id);
    if (input.email && input.email !== user.email) {
      const exists = await this.userRepository.findOne({ where: { email: input.email } });
      if (exists) {
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
    return this.userRepository.save(user);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.userRepository.delete(id);
    return result.affected === 1;
  }
}

