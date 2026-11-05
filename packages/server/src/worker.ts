import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { MongooseModule } from '@nestjs/mongoose'
import { RedisModule } from '@svtslv/nestjs-ioredis'

import { GraphqlService, MongoService, RedisService } from '@config'
import { validateEnvironment } from '@environments'
import { Logger } from '@utils'

import { ServiceModule } from './app.module'

/**
 * The worker needs the same connection providers as the API (Mongo/Redis via
 * forRootAsync) but none of the HTTP surface: no GraphQL, no controllers, no
 * guards. ServiceModule brings the Bull queues, cron schedules and services.
 */
@Module({
  imports: [
    RedisModule.forRootAsync({
      useClass: RedisService
    }),
    MongooseModule.forRootAsync({
      useClass: MongoService
    }),
    ServiceModule
  ]
})
class WorkerModule {}

async function bootstrap() {
  // Validate the environment before anything else is created, so a
  // misconfigured deployment fails fast with the complete problem list
  // instead of crashing later inside a service that needs a missing value.
  const environmentProblems = validateEnvironment()

  for (const problem of environmentProblems) {
    const message = `${problem.field}: ${problem.message}`

    if (problem.severity === 'error') {
      Logger.error(message, undefined, 'Environment')
    } else {
      Logger.warn(message, 'Environment')
    }
  }

  if (environmentProblems.some(problem => problem.severity === 'error')) {
    Logger.error(
      'Invalid environment configuration, see the problems above. Exiting.',
      undefined,
      'Environment'
    )
    process.exit(1)
  }

  // The worker runs only the background half of the app (Bull queues +
  // cron schedules), so an application context is enough — no HTTP
  // listener is created.
  const app = await NestFactory.createApplicationContext(WorkerModule)

  // Close Bull queues, Redis/Mongo connections and stop cron jobs
  // gracefully on SIGTERM/SIGINT.
  app.enableShutdownHooks()

  Logger.log(`MyForm worker started [${process.env.NODE_ENV || 'development'}]`, 'Worker')

  const shutdown = async () => {
    Logger.log('Shutting down worker…', 'Worker')

    // Safety net: force-exit if a queue or connection refuses to close.
    const forceExitTimer = setTimeout(() => {
      Logger.error('Graceful shutdown timed out after 10s, forcing exit', undefined, 'Worker')
      process.exit(1)
    }, 10_000)

    try {
      await app.close()
      clearTimeout(forceExitTimer)
      process.exit(0)
    } catch (error) {
      clearTimeout(forceExitTimer)
      Logger.error(error?.message || String(error), undefined, 'Worker')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown())
  process.on('SIGINT', () => void shutdown())
}

bootstrap().catch(error => {
  Logger.error(error?.message || String(error), undefined, 'Worker')
  process.exit(1)
})
