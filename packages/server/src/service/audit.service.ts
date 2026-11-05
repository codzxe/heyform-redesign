import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { AuditActorTypeEnum, AuditLogModel } from '@model'
import { helper } from '@myform/utils'

interface RecordAuditInput {
  teamId: string
  formId?: string
  actorType: AuditActorTypeEnum
  actorId?: string
  action: string
  target?: Record<string, any>
  meta?: Record<string, any>
  ip?: string
}

/**
 * Append-only audit trail. Failures never break the caller's flow: an audit
 * write is best-effort and logged when it cannot be persisted.
 */
@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLogModel.name) private readonly model: Model<AuditLogModel>) {}

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.model.create({
        teamId: input.teamId,
        formId: input.formId,
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        target: input.target,
        meta: input.meta,
        ip: input.ip,
        ts: Date.now()
      })
    } catch (error) {
      console.error('[AuditService] failed to persist audit event', input.action, error)
    }
  }

  async list(
    teamId: string,
    options: { page?: number; limit?: number; action?: string } = {}
  ): Promise<{ items: AuditLogModel[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page ?? 1)
    const limit = Math.min(100, Math.max(1, options.limit ?? 20))
    const filter: Record<string, any> = { teamId }

    if (helper.isValid(options.action)) {
      filter.action = options.action
    }

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter)
    ])

    return { items, total, page, limit }
  }
}
