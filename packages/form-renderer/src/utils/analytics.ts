import { getAPIBaseURL, getAnonymousId } from './api'

/**
 * Respondent interaction telemetry, batched in memory and flushed to the
 * public analytics endpoint. The form-open event is deliberately absent: the
 * server already counts a visit when the form is opened, so emitting it here
 * would double-count. Every failure is silent — telemetry never blocks the
 * respondent.
 */

export type AnalyticsEventKind =
  | 'field_enter'
  | 'field_exit'
  | 'answer_change'
  | 'validation_error'
  | 'page_next'
  | 'page_prev'
  | 'session_resumed'
  | 'completed'
  | 'abandoned'

export interface AnalyticsEventOptions {
  fieldId?: string
  durationMs?: number
  meta?: Record<string, any>
}

export interface AnalyticsEvent extends AnalyticsEventOptions {
  kind: AnalyticsEventKind
  ts: number
}

export interface IAnalytics {
  push: (kind: AnalyticsEventKind, options?: AnalyticsEventOptions) => void
}

export interface AnalyticsCollectorContext {
  formId: string
  /** The open token proving this batch belongs to a legitimate form open. */
  getOpenToken: () => string | undefined
  /** Whether the response was completed (suppresses the abandon event). */
  isCompleted: () => boolean
}

// The server accepts at most 50 events per request.
const MAX_BATCH_SIZE = 50
const FLUSH_BATCH_SIZE = 10

export class AnalyticsCollector implements IAnalytics {
  private queue: AnalyticsEvent[] = []
  private disposed = false
  private flushing = false

  constructor(
    private readonly context: AnalyticsCollectorContext,
    private readonly batchSize: number = FLUSH_BATCH_SIZE
  ) {}

  push(kind: AnalyticsEventKind, options?: AnalyticsEventOptions): void {
    if (this.disposed) {
      return
    }

    this.queue.push({
      kind,
      fieldId: options?.fieldId,
      durationMs: options?.durationMs,
      meta: options?.meta,
      ts: Date.now()
    })

    if (this.queue.length >= this.batchSize) {
      void this.flush()
    }
  }

  /**
   * Sends everything buffered, in batches the endpoint accepts. `keepalive`
   * lets the request outlive the page when it runs during pagehide. A failed
   * batch is dropped, never retried and never surfaced to the respondent.
   */
  async flush(keepalive = false): Promise<void> {
    if (this.disposed || this.flushing || this.queue.length < 1) {
      return
    }

    const openToken = this.context.getOpenToken()

    // Without an open token the endpoint rejects the batch, so drop it quietly.
    if (!openToken) {
      this.queue = []
      return
    }

    this.flushing = true

    try {
      while (this.queue.length > 0) {
        const events = this.queue.slice(0, MAX_BATCH_SIZE)
        const sent = events.length

        try {
          const response = await fetch(`${getAPIBaseURL()}/api/analytics/events`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Anonymous-ID': getAnonymousId()
            },
            body: JSON.stringify({
              formId: this.context.formId,
              openToken,
              events
            }),
            keepalive
          })

          if (!response.ok) {
            break
          }
        } catch {
          break
        }

        this.queue = this.queue.slice(sent)

        // A concurrent push during the await keeps its events for the next flush.
        if (this.queue.length < 1) {
          break
        }
      }
    } finally {
      // Anything unsent (endpoint or network failure) is discarded.
      this.queue = []
      this.flushing = false
    }
  }

  /** Records the abandon event when the respondent leaves mid-form. */
  pushAbandoned(fieldId?: string): void {
    if (this.disposed || this.context.isCompleted()) {
      return
    }

    this.push('abandoned', { fieldId })
  }

  dispose(): void {
    this.disposed = true
  }
}

export interface AnalyticsHandle extends AnalyticsCollector {
  dispose: () => void
}

export function createAnalyticsCollector(context: AnalyticsCollectorContext): AnalyticsHandle {
  const collector = new AnalyticsCollector(context)

  const handlePageHide = () => {
    collector.pushAbandoned()
    void collector.flush(true)
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      void collector.flush(true)
    }
  }

  window.addEventListener('pagehide', handlePageHide)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  const originalDispose = collector.dispose.bind(collector)

  return Object.assign(collector, {
    dispose() {
      originalDispose()
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  })
}
