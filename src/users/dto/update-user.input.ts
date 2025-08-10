import { Field, ID, InputType } from '@nestjs/graphql';
import { IsEmail, IsOptional, MinLength, IsUUID } from 'class-validator';

@InputType()
export class UpdateUserInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MinLength(8)
  password?: string;
}
