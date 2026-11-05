import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

import { Field, Float, InputType, ObjectType } from '@nestjs/graphql'
import { GraphQLJSONObject } from 'graphql-type-json'

// Deletion request kinds accepted by the public right-to-erasure endpoint.
// Account-level erasure has its own authenticated flow and cannot be requested
// here.
export const DELETION_REQUEST_TYPES = ['respondent_data', 'form_data']

@InputType()
export class CreateDeletionRequestInput {
  @Field()
  formId: string

  @Field()
  @IsIn(DELETION_REQUEST_TYPES, {
    message: 'The deletion request type must be respondent_data or form_data'
  })
  type: string

  // What the requester wants erased: { email?, anonymousId?, submissionIds? }
  @Field(type => GraphQLJSONObject)
  payload: Record<string, any>
}

@InputType()
export class ProcessDeletionRequestInput {
  @Field()
  id: string

  @Field()
  @IsBoolean()
  approve: boolean

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  note?: string
}

@InputType()
export class TeamAuditLogsInput {
  @Field()
  teamId: string

  @Field({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number

  @Field({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  action?: string
}

@ObjectType()
export class DeletionRequestType {
  @Field()
  id: string

  @Field()
  teamId: string

  @Field({ nullable: true })
  formId?: string

  @Field()
  type: string

  @Field()
  status: string

  @Field(type => GraphQLJSONObject)
  requestPayload: Record<string, any>

  @Field({ nullable: true })
  requestedBy?: string

  @Field({ nullable: true })
  processedBy?: string

  @Field(type => Float, { nullable: true })
  processedAt?: number

  @Field({ nullable: true })
  resultNote?: string

  @Field(type => Float)
  createdAt: number
}

@ObjectType()
export class DeletionRequestPageType {
  @Field(type => [DeletionRequestType])
  items: DeletionRequestType[]

  @Field()
  total: number
}

@ObjectType()
export class AuditLogType {
  @Field()
  id: string

  @Field()
  teamId: string

  @Field({ nullable: true })
  formId?: string

  @Field()
  actorType: string

  @Field({ nullable: true })
  actorId?: string

  @Field()
  action: string

  @Field(type => GraphQLJSONObject, { nullable: true })
  target?: Record<string, any>

  @Field(type => GraphQLJSONObject, { nullable: true })
  meta?: Record<string, any>

  @Field({ nullable: true })
  ip?: string

  @Field(type => Float)
  createdAt: number
}

@ObjectType()
export class AuditLogPageType {
  @Field(type => [AuditLogType])
  items: AuditLogType[]

  @Field()
  total: number

  @Field()
  page: number

  @Field()
  limit: number
}
