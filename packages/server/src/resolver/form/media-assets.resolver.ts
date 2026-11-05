import {
  MediaAssetPageType,
  MediaAssetType,
  MediaAssetsInput
} from '../../common/graphql/media.graphql'
import { Auth, FormGuard } from '@decorator'
import { Args, Query, Resolver } from '@nestjs/graphql'
import { MediaAssetService } from '@service'

function toUnixSeconds(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime() / 1000
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toMediaAssetType(item: Record<string, any>): MediaAssetType {
  const transcript = item.transcript

  return {
    id: String(item._id ?? item.id),
    kind: item.kind,
    filename: item.filename,
    url: item.url,
    size: item.size,
    durationSeconds: item.durationSeconds,
    status: item.status,
    transcript: transcript
      ? {
          text: transcript.text,
          provider: transcript.provider,
          language: transcript.language,
          status: transcript.status,
          error: transcript.error
        }
      : undefined,
    createdAt: toUnixSeconds(item.createdAt)
  }
}

@Resolver()
@Auth()
export class MediaAssetsResolver {
  constructor(private readonly mediaAssetService: MediaAssetService) {}

  @Query(returns => MediaAssetPageType)
  @FormGuard()
  async mediaAssets(@Args('input') input: MediaAssetsInput): Promise<MediaAssetPageType> {
    const result = await this.mediaAssetService.page(input.formId, {
      fieldId: input.fieldId,
      page: input.page,
      limit: input.limit
    })

    return {
      items: result.items.map(item => toMediaAssetType(item as any)),
      total: result.total,
      page: result.page,
      limit: result.limit
    }
  }
}
