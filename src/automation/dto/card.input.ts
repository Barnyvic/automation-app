import { Field, InputType, Int } from '@nestjs/graphql';
import { IsCreditCard, IsInt, IsNotEmpty, IsOptional, IsPostalCode, Length, Max, Min } from 'class-validator';

@InputType()
export class CardInput {
  @Field()
  @IsCreditCard()
  cardNumber!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(12)
  expiryMonth!: number;

  @Field(() => Int)
  @IsInt()
  @Min(2024)
  @Max(2100)
  expiryYear!: number;

  @Field()
  @Length(3, 4)
  cvc!: string;

  @Field()
  @IsNotEmpty()
  nameOnCard!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsPostalCode('any')
  postalCode?: string;
}

