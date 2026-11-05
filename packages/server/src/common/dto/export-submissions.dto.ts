import { IsISO8601, IsIn, IsOptional, IsString } from 'class-validator'

// Formats the submissions export endpoint can produce
export const EXPORT_SUBMISSION_FORMATS = ['csv', 'xlsx', 'pdf'] as const

export type ExportSubmissionFormat = (typeof EXPORT_SUBMISSION_FORMATS)[number]

export class ExportSubmissionsDto {
  @IsString()
  formId: string

  // Defaults to 'csv' when omitted (resolved by the controller)
  @IsOptional()
  @IsIn(EXPORT_SUBMISSION_FORMATS)
  format?: string

  // Optional period filter, ISO 8601 dates; a submission counts when its
  // endAt (or createdAt when endAt is absent) falls within [from, to]
  @IsOptional()
  @IsISO8601()
  from?: string

  @IsOptional()
  @IsISO8601()
  to?: string
}
