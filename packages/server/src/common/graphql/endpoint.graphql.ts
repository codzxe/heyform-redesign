import { HiddenFieldAnswer } from '@myform/shared-types-enums'
import { IsOptional, IsString, Length } from 'class-validator'

import { CdnTokenInput } from './user.graphql'
import { Field, InputType, ObjectType } from '@nestjs/graphql'
import { GraphQLJSONObject } from 'graphql-type-json'

@InputType()
export class UploadFormFileInput extends CdnTokenInput {
  @Field()
  formId: string
}

@InputType()
export class UploadFormSignatureInput {
  @Field()
  formId: string

  @Field()
  signature: string
}

@InputType()
export class OpenFormInput {
  @Field()
  formId: string
}

@InputType()
export class VerifyPasswordInput {
  @Field()
  formId: string

  @Field()
  @Length(1, 128)
  password: string
}

@InputType()
class HiddenFieldAnswerInput {
  @Field()
  id: string

  @Field()
  name: string

  @Field({ nullable: true })
  value?: string
}

@InputType()
export class CompleteSubmissionInput {
  @Field()
  formId: string

  @Field(type => GraphQLJSONObject)
  answers: Record<string, any>

  @Field(type => [HiddenFieldAnswerInput])
  hiddenFields: HiddenFieldAnswer[]

  @Field({ nullable: true })
  partialSubmission?: boolean

  @Field()
  openToken: string

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  passwordToken?: string

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  recaptchaToken?: string

  // Save & resume: links the completed submission to its session
  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  sessionToken?: string

  // GDPR consent, recorded when the form asks for it
  @Field({ nullable: true })
  consentAccepted?: boolean
}

@ObjectType()
export class CompleteSubmissionType {
  @Field({ nullable: true })
  clientSecret?: string

  @Field({ nullable: true })
  score?: number

  @Field({ nullable: true })
  totalScore?: number

  @Field({ nullable: true })
  percentage?: number

  @Field({ nullable: true })
  passed?: boolean

  @Field({ nullable: true })
  correctCount?: number

  @Field({ nullable: true })
  questionCount?: number

  @Field({ nullable: true })
  leaderboardRank?: number
}

@InputType()
export class SaveResponseSessionInput {
  @Field()
  formId: string

  @Field()
  openToken: string

  @Field({ nullable: true })
  sessionToken?: string

  @Field(type => [GraphQLJSONObject], { defaultValue: [] })
  answers: Record<string, any>[]

  @Field(type => [GraphQLJSONObject], { defaultValue: [] })
  hiddenFields: Record<string, any>[]

  @Field(type => [GraphQLJSONObject], { defaultValue: [] })
  variables: Record<string, any>[]

  @Field({ nullable: true })
  currentFieldId?: string

  @Field({ nullable: true })
  startAt?: number
}

@ObjectType()
export class ResponseSessionSaveType {
  @Field()
  sessionToken: string

  @Field()
  expiresAt: number
}

@InputType()
export class ResumeResponseSessionInput {
  @Field()
  formId: string

  @Field()
  token: string
}

@ObjectType()
export class ResponseSessionResumeType {
  @Field(type => [GraphQLJSONObject], { defaultValue: [] })
  answers: Record<string, any>[]

  @Field(type => [GraphQLJSONObject], { defaultValue: [] })
  hiddenFields: Record<string, any>[]

  @Field(type => [GraphQLJSONObject], { defaultValue: [] })
  variables: Record<string, any>[]

  @Field({ nullable: true })
  currentFieldId?: string

  @Field()
  expiresAt: number
}

@ObjectType()
export class UploadFormFileType {
  @Field()
  filename: string

  @Field()
  url: string

  @Field()
  size: number
}
