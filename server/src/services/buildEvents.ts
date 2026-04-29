import { EventEmitter } from 'events'

/**
 * 进程内事件总线：buildWorker 在写完一条 build_logs 或更新 build status
 * 之后立刻 emit；SSE 路由订阅这些事件并把它们写入响应流推给浏览器。
 *
 * 选型：使用 EventEmitter 而不是 Redis pub/sub 等外部队列，原因：
 *  - 当前部署是单进程后端（docker / systemd 都是单实例），没有跨进程需求
 *  - 内存级广播延迟 < 1ms，比 Redis 更适合"日志逐行实时推"
 *  - 完全无依赖，所有部署模式（裸机 / docker / pm2 单实例）都能用
 *
 * 未来如果要做多实例水平扩展，把 EventEmitter 换成 Redis pub/sub 即可，
 * 上层 subscribe / publish API 不变，BuildConsole 与 SSE 路由代码无需改动。
 */
class BuildEventBus extends EventEmitter {
  constructor() {
    super()
    // 默认 10 偏低：同一个 build 可能多个用户同时打开 console + 心跳定时器，
    // 调到 50 可覆盖正常使用，超过则代码层有 bug 而非业务规模问题
    this.setMaxListeners(50)
  }
}

const bus = new BuildEventBus()

/**
 * 单条 build log 事件。emit 频率高（每行命令输出一次），所以 payload 必须紧凑。
 */
export interface BuildLogEvent {
  id: string
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  source?: string
}

/**
 * build 状态变更事件。会触发 SSE 在终态（success/failed）时主动断开连接。
 */
export interface BuildStatusEvent {
  status: string
  endTime?: string
  error?: string
}

/* ----------------------------- emit ----------------------------- */

/**
 * 推送一条新日志。channel 用 `log:${buildId}` 让订阅方天然按 build 隔离，
 * 单 build 终态后 unsubscribe 不会影响其他 build 的订阅者。
 */
export function emitBuildLog(buildId: string, log: BuildLogEvent): void {
  bus.emit(`log:${buildId}`, log)
}

/**
 * 推送 build 状态变更（cloning / installing / ... / success / failed）。
 */
export function emitBuildStatus(
  buildId: string,
  status: string,
  endTime?: string,
  error?: string
): void {
  bus.emit(`status:${buildId}`, { status, endTime, error } satisfies BuildStatusEvent)
}

/* ---------------------------- subscribe ---------------------------- */

export interface BuildSubscriber {
  onLog: (log: BuildLogEvent) => void
  onStatus: (status: BuildStatusEvent) => void
}

/**
 * 订阅指定 build 的实时事件。返回 unsubscribe 函数，调用方必须在断开时调用，
 * 否则 listener 永远挂在 emitter 上造成内存泄漏。
 */
export function subscribeBuildEvents(
  buildId: string,
  subscriber: BuildSubscriber
): () => void {
  const logChannel = `log:${buildId}`
  const statusChannel = `status:${buildId}`
  bus.on(logChannel, subscriber.onLog)
  bus.on(statusChannel, subscriber.onStatus)

  return () => {
    bus.off(logChannel, subscriber.onLog)
    bus.off(statusChannel, subscriber.onStatus)
  }
}
