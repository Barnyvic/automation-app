import { Resolver, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { AutomationService } from './automation.service';
import { CardInput } from './dto/card.input';

@UseGuards(GqlAuthGuard)
@Resolver()
export class AutomationResolver {
  constructor(private readonly automationService: AutomationService) {}

  @Mutation(() => Boolean)
  async updateCardPayment(
    @Args('userId', { type: () => ID }) userId: string,
    @Args('email') email: string,
    @Args('password') password: string,
    @Args('card') card: CardInput,
  ): Promise<boolean> {
    return this.automationService.updateCardForUser(userId, { email, password }, card);
  }
}

