import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min
} from 'class-validator'

import { FormDetailInput } from './form.graphql'
import { Field, InputType, Int, ObjectType } from '@nestjs/graphql'

// Matches ScheduledReportFrequencyEnum values in the model
export const SCHEDULED_REPORT_FREQUENCIES = ['weekly', 'monthly'] as const

@InputType()
export class ScheduledReportsInput extends FormDetailInput {}

@InputType()
export class CreateScheduledReportInput extends FormDetailInput {
  @Field()
  @IsIn(SCHEDULED_REPORT_FREQUENCIES)
  frequency: string

  // 0 (Sunday) - 6 (Saturday), required for weekly reports
  @Field(type => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number

  // 1-28, required for monthly reports (28 so every month has the day)
  @Field(type => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number

  @Field()
  @IsString()
  @Length(1, 64)
  timezone: string

  @Field(type => [String])
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  recipients: string[]
}

@InputType()
export class UpdateScheduledReportInput extends FormDetailInput {
  @Field()
  @IsString()
  id: string

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(SCHEDULED_REPORT_FREQUENCIES)
  frequency?: string

  @Field(type => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number

  @Field(type => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  timezone?: string

  @Field(type => [String], { nullable: true })
  @IsOptional()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  recipients?: string[]

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

@InputType()
export class DeleteScheduledReportInput extends FormDetailInput {
  @Field()
  @IsString()
  id: string
}

@ObjectType()
export class ScheduledReportType {
  @Field()
  id: string

  @Field()
  formId: string

  @Field()
  frequency: string

  @Field(type => Int, { nullable: true })
  dayOfWeek?: number

  @Field(type => Int, { nullable: true })
  dayOfMonth?: number

  @Field()
  timezone: string

  @Field(type => [String])
  recipients: string[]

  @Field()
  enabled: boolean

  @Field()
  nextRunAt: number

  @Field({ nullable: true })
  lastRunAt?: number

  @Field()
  status: string

  @Field({ nullable: true })
  lastError?: string

  @Field()
  createdAt: number
}
