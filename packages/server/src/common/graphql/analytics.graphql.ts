import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator'

import { FormDetailInput } from './form.graphql'
import { FormAnalyticRangeEnum } from '@model'
import { Field, InputType, Int, ObjectType } from '@nestjs/graphql'

/**
 * Metric groups a public dashboard share may expose. The share's owner picks a
 * subset when creating it; the public endpoint only ever returns these groups
 * and never any respondent-identifying data.
 */
export const DASHBOARD_SHARE_METRICS = ['overview', 'trends', 'questions', 'heatmap'] as const
export type DashboardShareMetric = (typeof DASHBOARD_SHARE_METRICS)[number]

@ObjectType()
export class TrendPointType {
  // Calendar day, YYYY-MM-DD
  @Field()
  date: string

  @Field(type => Int)
  count: number
}

@ObjectType()
export class BreakdownItemType {
  @Field()
  label: string

  @Field(type => Int)
  count: number
}

@ObjectType()
export class MediaCountsType {
  @Field(type => Int)
  voice: number

  @Field(type => Int)
  video: number

  @Field(type => Int)
  screen: number
}

@ObjectType()
export class QuizAnalyticsType {
  @Field()
  averageScore: number

  @Field()
  averagePercentage: number

  @Field()
  highestScore: number

  // Share of scored responses that passed, 0-100
  @Field()
  passingRate: number

  @Field(type => Int)
  responseCount: number
}

@ObjectType()
export class FormAnalyticsOverviewType {
  @Field(type => Int)
  totalVisits: number

  @Field(type => Int)
  totalResponses: number

  // 0-100, two decimals
  @Field()
  completionRate: number

  // 0-100, two decimals
  @Field()
  abandonmentRate: number

  @Field()
  avgCompletionTimeSeconds: number

  // One point per calendar day of the whole range, missing days filled with 0
  @Field(type => [TrendPointType])
  responseTrend: TrendPointType[]

  @Field(type => [BreakdownItemType])
  deviceBreakdown: BreakdownItemType[]

  @Field(type => [BreakdownItemType])
  browserBreakdown: BreakdownItemType[]

  @Field(type => MediaCountsType)
  mediaCounts: MediaCountsType

  // Only for quiz forms, null otherwise
  @Field(type => QuizAnalyticsType, { nullable: true })
  quiz?: QuizAnalyticsType
}

@ObjectType()
export class FormHeatmapItemType {
  @Field()
  fieldId: string

  @Field(type => Int)
  visits: number

  @Field()
  avgTimeMs: number

  @Field(type => Int)
  answerChanges: number

  @Field(type => Int)
  validationErrors: number

  @Field(type => Int)
  abandonments: number
}

@ObjectType()
export class DashboardShareType {
  @Field()
  id: string

  // The plaintext share token. It is returned once, on creation; listings only
  // have the stored hash, so they return an empty string here.
  @Field()
  token: string

  // Full public dashboard URL, available only on a freshly created share
  @Field()
  url: string

  @Field(type => [String])
  metrics: string[]

  // Epoch seconds
  @Field({ nullable: true })
  expiresAt?: number

  // Epoch seconds, set when the share is revoked
  @Field({ nullable: true })
  revokedAt?: number

  // Epoch seconds
  @Field()
  createdAt: number
}

@InputType()
export class FormAnalyticsOverviewInput extends FormDetailInput {
  @Field(type => String)
  @IsEnum(FormAnalyticRangeEnum)
  range: FormAnalyticRangeEnum
}

@InputType()
export class FormHeatmapInput extends FormDetailInput {
  @Field(type => String)
  @IsEnum(FormAnalyticRangeEnum)
  range: FormAnalyticRangeEnum
}

@InputType()
export class DashboardSharesInput extends FormDetailInput {}

@InputType()
export class CreateDashboardShareInput extends FormDetailInput {
  @Field(type => [String])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(DASHBOARD_SHARE_METRICS.length)
  @IsIn(DASHBOARD_SHARE_METRICS as unknown as string[], { each: true })
  metrics: string[]

  @Field(type => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number
}

@InputType()
export class RevokeDashboardShareInput {
  @Field()
  @IsString()
  shareId: string
}
