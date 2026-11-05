import { FieldKindEnum } from '@myform/shared-types-enums'
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

import { FormDetailInput } from './form.graphql'
import { Field, Float, InputType, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class TranscriptType {
  @Field({ nullable: true })
  text?: string

  @Field({ nullable: true })
  provider?: string

  @Field({ nullable: true })
  language?: string

  @Field(type => String)
  status: string

  @Field({ nullable: true })
  error?: string
}

@ObjectType()
export class MediaAssetType {
  @Field()
  id: string

  @Field(type => String)
  kind: FieldKindEnum

  @Field()
  filename: string

  @Field()
  url: string

  @Field()
  size: number

  @Field({ nullable: true })
  durationSeconds?: number

  @Field(type => String)
  status: string

  @Field(type => TranscriptType, { nullable: true })
  transcript?: TranscriptType

  @Field(type => Float)
  createdAt: number
}

@ObjectType()
export class MediaAssetPageType {
  @Field(type => [MediaAssetType])
  items: MediaAssetType[]

  @Field()
  total: number

  @Field()
  page: number

  @Field()
  limit: number
}

@InputType()
export class MediaAssetsInput extends FormDetailInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  fieldId?: string

  @Field({ nullable: true, defaultValue: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number

  @Field({ nullable: true, defaultValue: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number
}
