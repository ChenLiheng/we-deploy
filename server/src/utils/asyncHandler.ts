import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * Express 4 不会捕获 async 处理函数返回的 rejected Promise，
 * 未处理的异常会变成 unhandledRejection 且请求一直挂起。
 * 用它包裹 async 路由，把异常转交给 errorHandler 中间件。
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next)
  }
}
