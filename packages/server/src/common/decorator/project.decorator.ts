import { ExecutionContext, createParamDecorator } from '@nestjs/common'

import { helper } from '@myform/utils'
import { UserModel } from '@model'
import { GqlExecutionContext } from '@nestjs/graphql'

export const Project = createParamDecorator((_: any, context: ExecutionContext): UserModel => {
  const ctx = GqlExecutionContext.create(context)
  let { req } = ctx.getContext()

  if (helper.isEmpty(req)) {
    req = context.switchToHttp().getRequest()
  }

  return req.project
})
