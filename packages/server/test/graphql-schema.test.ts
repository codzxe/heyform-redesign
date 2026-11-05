import { ApolloDriver } from '@nestjs/apollo'
import { Test } from '@nestjs/testing'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import assert from 'assert'

import * as ResolverModule from '../src/resolver'
import { LowerCaseScalar } from '../src/utils'
import { GraphQLModule } from '@nestjs/graphql'

function isClass(value: unknown): value is new (...args: any[]) => any {
  return typeof value === 'function'
}

/**
 * Boots the GraphQL module with every registered resolver, exactly like the
 * application does at bootstrap, with all services mocked out. Catches
 * inconsistent input/output types, duplicate type names and decorator
 * mistakes before runtime — without needing MongoDB or Redis.
 */
async function run() {
  const resolverClasses = Object.values(ResolverModule).filter(isClass)

  assert.ok(
    resolverClasses.length >= 20,
    `expected to discover the registered resolver classes, found ${resolverClasses.length}`
  )

  const moduleRef = await Test.createTestingModule({
    imports: [
      // The AI and invite resolvers guard mutations with the throttler; the
      // storage must exist for the guard's init hook.
      ThrottlerModule.forRoot([
        {
          name: 'testing',
          ttl: 60_000,
          limit: 1_000_000
        }
      ]),
      GraphQLModule.forRoot({
        driver: ApolloDriver,
        autoSchemaFile: true,
        resolverValidationOptions: {
          requireResolversForResolveType: 'ignore'
        }
      })
    ],
    providers: [
      ...resolverClasses,
      LowerCaseScalar,
      {
        provide: ThrottlerGuard,
        useClass: ThrottlerGuard
      }
    ]
  })
    .useMocker(token => {
      // Every service, model, queue and guard dependency becomes a permissive
      // mock; the schema is built from decorators alone.
      if (typeof token === 'function') {
        return new (token as new () => unknown)()
      }
      return {}
    })
    .compile()

  // Initialize the module tree so the Apollo adapter builds the schema
  await moduleRef.init()

  const graphQlModule = moduleRef.get(GraphQLModule, { strict: false })
  assert.ok(graphQlModule, 'GraphQL module must initialize')

  const schema = (graphQlModule as any).gqlSchemaHost?.schema
  assert.ok(schema, 'the Apollo server must have produced a schema')

  const queryType = schema.getQueryType()
  const mutationType = schema.getMutationType()
  assert.ok(queryType, 'schema must define a Query type')
  assert.ok(mutationType, 'schema must define a Mutation type')

  const queries = Object.keys(queryType.getFields())
  const mutations = Object.keys(mutationType.getFields())

  const expectedQueries = [
    'resumeResponseSession',
    'publicLeaderboard',
    'formLeaderboard',
    'formAnalyticsOverview',
    'formHeatmap',
    'dashboardShares',
    'scheduledReports',
    'mediaAssets',
    'deletionRequests',
    'teamAuditLogs'
  ]
  for (const name of expectedQueries) {
    assert.ok(queries.includes(name), `Query.${name} missing from the schema`)
  }

  const expectedMutations = [
    'saveResponseSession',
    'createDashboardShare',
    'revokeDashboardShare',
    'createScheduledReport',
    'updateScheduledReport',
    'deleteScheduledReport',
    'createDeletionRequest',
    'processDeletionRequest'
  ]
  for (const name of expectedMutations) {
    assert.ok(mutations.includes(name), `Mutation.${name} missing from the schema`)
  }

  // The settings surface must keep listing every FormSettings field the
  // dashboard Settings page can save, on both the write and the read side.
  const expectedSettingsFields = [
    'responseLayout',
    'showResultsOnCompletion',
    'quizPassingScore',
    'showLeaderboard',
    'leaderboardSize',
    'anonymousLeaderboard',
    'enableResponseConsent',
    'consentText',
    'consentVersion',
    'retentionDays'
  ]

  const updateFormInputType = schema.getType('UpdateFormInput')
  assert.ok(updateFormInputType, 'UpdateFormInput must exist in the schema')
  const updateFormInputFields = Object.keys((updateFormInputType as any).getFields())

  const formSettingType = schema.getType('FormSettingType')
  assert.ok(formSettingType, 'FormSettingType must exist in the schema')
  const formSettingFields = Object.keys((formSettingType as any).getFields())

  for (const name of expectedSettingsFields) {
    assert.ok(
      updateFormInputFields.includes(name),
      `UpdateFormInput.${name} missing from the schema`
    )
    assert.ok(formSettingFields.includes(name), `FormSettingType.${name} missing from the schema`)
  }

  console.log(
    `GraphQL schema built: ${queries.length} queries, ${mutations.length} mutations, all MyForm fields present`
  )
  await moduleRef.close()
}

run().catch(error => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exitCode = 1
})
