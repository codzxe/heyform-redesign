import { IsNumber, IsOptional } from 'class-validator'

import { FormDetailInput } from './form.graphql'
import { Field, InputType, Int, ObjectType } from '@nestjs/graphql'

/**
 * One row of a form's quiz leaderboard. Entries expose display fields only —
 * rank, display name, score, percentage and completion time — never answer
 * content or respondent identifiers.
 */
@ObjectType()
export class LeaderboardEntryType {
  // Standard competition ranking: ties share a rank, the next score skips
  @Field(type => Int)
  rank: number

  // Full name answer, else email answer, else "Anonymous <short id>"
  @Field()
  displayName: string

  @Field()
  score: number

  @Field()
  percentage: number

  @Field()
  completedAt: number
}

@InputType()
export class FormLeaderboardInput extends FormDetailInput {
  // Rows to return; clamped server-side to 1..50, 10 by default
  @Field(type => Int, { nullable: true, defaultValue: 10 })
  @IsOptional()
  @IsNumber()
  limit?: number
}
