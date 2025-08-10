import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthPayload } from './models/auth.model';
import { LoginInput } from './dto/login.input';
import { RegisterInput } from './dto/register.input';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { plainToInstance } from 'class-transformer';
import { UserModel } from '../users/models/user.model';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Mutation(() => AuthPayload)
  async login(@Args('input') input: LoginInput): Promise<AuthPayload> {
    const user = await this.authService.validateUser(input.email, input.password);
    const accessToken = await this.authService.signToken(user);
    return { accessToken, user: plainToInstance(UserModel, user) };
  }

  @Mutation(() => AuthPayload)
  async register(@Args('input') input: RegisterInput): Promise<AuthPayload> {
    const user = await this.usersService.create({ email: input.email, name: input.name, password: input.password });
    const accessToken = await this.authService.signToken(user);
    return { accessToken, user: plainToInstance(UserModel, user) };
  }
}

