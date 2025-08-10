import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UsersService } from './users.service';
import { UserModel } from './models/user.model';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { plainToInstance } from 'class-transformer';

@UseGuards(GqlAuthGuard)
@Resolver(() => UserModel)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => [UserModel])
  async users(): Promise<UserModel[]> {
    const users = await this.usersService.findAll();
    return users.map((u) => plainToInstance(UserModel, u));
  }

  @Query(() => UserModel)
  async user(@Args('id', { type: () => ID }) id: string): Promise<UserModel> {
    const user = await this.usersService.findById(id);
    return plainToInstance(UserModel, user);
  }

  @Mutation(() => UserModel)
  async createUser(@Args('input') input: CreateUserInput): Promise<UserModel> {
    const user = await this.usersService.create(input);
    return plainToInstance(UserModel, user);
  }

  @Mutation(() => UserModel)
  async updateUser(@Args('input') input: UpdateUserInput): Promise<UserModel> {
    const user = await this.usersService.update(input);
    return plainToInstance(UserModel, user);
  }

  @Mutation(() => Boolean)
  async removeUser(@Args('id', { type: () => ID }) id: string): Promise<boolean> {
    return this.usersService.remove(id);
  }
}

