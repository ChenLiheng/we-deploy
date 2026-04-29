import { create } from 'zustand'
import api from '@services/serverApi'
import type { BuildRecord, BuildLog, BuildStatus } from '@/types'
import { getStoredAuthToken } from './authStore'

/**
 * 当前订阅日志的传输方式：
 *  - 'sse'      ：通过浏览器原生 EventSource 实时推送（首选）
 *  - 'polling'  ：SSE 不可用时降级到 2s 轮询 /logs?since=（兜底）
 *  - 'idle'     ：尚未连接 / 已断开
 */
export type LogTransport = 'idle' | 'sse' | 'polling'

interface BuildConsoleState {
  currentBuild: BuildRecord | null
  logs: BuildLog[]
  isStreaming: boolean
  status: BuildStatus
  /**
   * 已收到日志中的最大 timestamp，作为下一次增量拉取或断线重连的 since 游标。
   * 0 表示尚未拉过任何日志。
   * 服务端用 `timestamp > since` 做严格大于判断，所以同毫秒多条不会丢；
   * 重复的请求只会拿到新增条目，避免单次响应随时间膨胀。
   */
  lastLogTs: number
  /** 当前日志通道形态，用于 UI 角标提示 + 调试 */
  transport: LogTransport

  setBuild: (build: BuildRecord) => void
  addLog: (log: Omit<BuildLog, 'id' | 'timestamp'>) => void
  addLogs: (logs: Omit<BuildLog, 'id' | 'timestamp'>[]) => void
  updateStatus: (status: BuildStatus) => void
  setStreaming: (streaming: boolean) => void
  clearConsole: () => void
  fetchBuild: (buildId: string) => Promise<void>
  fetchBuildLogs: (buildId: string) => Promise<void>

  /**
   * 启动实时日志订阅。优先 SSE，失败自动降级轮询。
   * 返回 cleanup 函数，组件卸载或切换 buildId 时必须调用。
   */
  connectStream: (buildId: string) => () => void
}

/**
 * 把后端原始 log 对象转成 BuildLog（dropping undefined 等）。
 */
function normalizeLog(raw: any): BuildLog {
  return {
    id: raw.id,
    timestamp: raw.timestamp,
    level: raw.level,
    message: raw.message,
    source: raw.source || undefined,
  }
}

function appendAccessToken(url?: string): string | undefined {
  const token = getStoredAuthToken()
  if (!url || !token) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}access_token=${encodeURIComponent(token)}`
}

function normalizeBuild(raw: BuildRecord): BuildRecord {
  return {
    ...raw,
    qrcodeUrl: appendAccessToken(raw.qrcodeUrl),
  }
}

/**
 * 模块级单连接句柄。
 * 保证不会因为「切换 buildId / 刷新按钮 / hot reload」叠加出多个 EventSource，
 * 任何一次 connectStream 调用都先关掉前一个再建新连接。
 */
let activeDisconnect: (() => void) | null = null

export const useBuildConsoleStore = create<BuildConsoleState>((set, get) => ({
  currentBuild: null,
  logs: [],
  isStreaming: false,
  status: 'pending',
  lastLogTs: 0,
  transport: 'idle',

  setBuild: (build) =>
    set({
      currentBuild: normalizeBuild(build),
      logs: build.logs || [],
      status: build.status,
      lastLogTs: (build.logs || []).reduce((mx, l) => (l.timestamp > mx ? l.timestamp : mx), 0),
    }),

  addLog: (log) => {
    const newLog: BuildLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    }
    set((state) => ({ logs: [...state.logs, newLog] }))
  },

  addLogs: (logs) => {
    const newLogs: BuildLog[] = logs.map((log) => ({
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    }))
    set((state) => ({ logs: [...state.logs, ...newLogs] }))
  },

  updateStatus: (status) => set({ status }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  clearConsole: () => set({ logs: [], lastLogTs: 0, transport: 'idle' }),

  fetchBuild: async (buildId: string) => {
    try {
      const { data } = await api.get(`/builds/${buildId}`)
      set({ currentBuild: normalizeBuild(data), status: data.status })
    } catch {
      // build not found yet
    }
  },

  fetchBuildLogs: async (buildId: string) => {
    try {
      const { lastLogTs } = get()
      // 仅拉取增量：以已知最大 timestamp 作为游标，避免每次都拉全量
      const url = lastLogTs > 0 ? `/builds/${buildId}/logs?since=${lastLogTs}` : `/builds/${buildId}/logs`
      const { data } = await api.get<BuildLog[]>(url)
      if (!Array.isArray(data) || data.length === 0) return
      set((state) => {
        const merged = lastLogTs > 0 ? [...state.logs, ...data] : data
        const nextTs = data.reduce((mx, l) => (l.timestamp > mx ? l.timestamp : mx), state.lastLogTs)
        return { logs: merged, lastLogTs: nextTs }
      })
    } catch {
      // 网络或瞬时错误：忽略，下一轮轮询会自动恢复
    }
  },

  connectStream: (buildId: string) => {
    // 任何新连接前先关掉旧连接，避免叠加
    if (activeDisconnect) {
      activeDisconnect()
      activeDisconnect = null
    }
    // 浏览器没有 EventSource 时直接走轮询（IE / 极老 webview）
    const disconnect =
      typeof window === 'undefined' || typeof window.EventSource === 'undefined'
        ? startPolling(buildId, set, get)
        : startSSE(buildId, set, get)
    activeDisconnect = disconnect
    return () => {
      disconnect()
      // 仅当当前 active 仍然是自己时清空，避免覆盖新连接
      if (activeDisconnect === disconnect) activeDisconnect = null
    }
  },
}))

/**
 * SSE 通道实现。
 * 设计：
 *  - 首次拉取走全量（不带 since），后续重连时浏览器自动带上 Last-Event-ID = lastLogTs
 *    我们的 SSE 路由也支持 ?since= 参数显式传，这里用前者更省事
 *  - 5s 内连续重连 N 次仍失败则降级到轮询，避免无限重连堆 CPU
 *  - 服务端发完终态会主动 close 连接，浏览器会触发 onerror（readyState === CLOSED），
 *    在 cleanup 时正确区分"主动结束"与"网络断开"
 */
function startSSE(
  buildId: string,
  set: (
    state:
      | Partial<BuildConsoleState>
      | ((s: BuildConsoleState) => Partial<BuildConsoleState>)
  ) => void,
  get: () => BuildConsoleState
): () => void {
  const url = `/api/builds/${buildId}/logs/stream`
  let es: EventSource | null = new EventSource(url)
  let fallbackCleanup: (() => void) | null = null
  let consecutiveErrors = 0
  let ended = false // 服务端主动发了 end 事件

  set({ transport: 'sse' })

  es.addEventListener('log', (e) => {
    consecutiveErrors = 0
    try {
      const log = normalizeLog(JSON.parse((e as MessageEvent).data))
      set((state) => {
        // 用 lastLogTs 去重：同一 build 多次重连历史会被部分重发，靠 ts 过滤
        if (log.timestamp <= state.lastLogTs) return {}
        return {
          logs: [...state.logs, log],
          lastLogTs: log.timestamp,
        }
      })
    } catch {
      /* 解析失败忽略单条 */
    }
  })

  es.addEventListener('status', (e) => {
    consecutiveErrors = 0
    try {
      const { status } = JSON.parse((e as MessageEvent).data) as { status: BuildStatus }
      set({ status })
    } catch {
      /* ignore */
    }
  })

  es.addEventListener('end', () => {
    ended = true
    es?.close()
    es = null
  })

  es.addEventListener('error', () => {
    if (ended) return // 服务端主动发的 end，忽略后续 error

    // 浏览器会自动重连（默认 3s），这里仅在连接彻底关闭时才考虑降级
    if (es?.readyState === EventSource.CLOSED) {
      consecutiveErrors += 1
      if (consecutiveErrors >= 3) {
        // 连续重连失败 → 降级到轮询，至少能保证日志可达
        es = null
        fallbackCleanup = startPolling(buildId, set, get)
      }
    }
  })

  return () => {
    ended = true
    if (es) {
      es.close()
      es = null
    }
    if (fallbackCleanup) {
      fallbackCleanup()
      fallbackCleanup = null
    }
    set({ transport: 'idle' })
  }
}

/**
 * 兜底轮询通道：仅当 SSE 不可用时启用。
 * 与之前版本逻辑一致：2s 一轮，带 since 增量拉取。
 */
function startPolling(
  buildId: string,
  set: (
    state:
      | Partial<BuildConsoleState>
      | ((s: BuildConsoleState) => Partial<BuildConsoleState>)
  ) => void,
  get: () => BuildConsoleState
): () => void {
  set({ transport: 'polling' })

  const tick = async () => {
    const { status, lastLogTs } = get()
    // 终态后停止轮询，与原行为一致
    if (status === 'success' || status === 'failed') {
      stopped = true
      return
    }
    try {
      const url = lastLogTs > 0 ? `/builds/${buildId}/logs?since=${lastLogTs}` : `/builds/${buildId}/logs`
      const { data } = await api.get<BuildLog[]>(url)
      if (Array.isArray(data) && data.length > 0) {
        set((state) => {
          const merged = lastLogTs > 0 ? [...state.logs, ...data] : data
          const nextTs = data.reduce((mx, l) => (l.timestamp > mx ? l.timestamp : mx), state.lastLogTs)
          return { logs: merged, lastLogTs: nextTs }
        })
      }
      // 同时刷新 build 元信息（status / qrcodeUrl 等）
      const { data: buildData } = await api.get(`/builds/${buildId}`)
      set({ currentBuild: buildData, status: buildData.status })
    } catch {
      /* ignore polling errors */
    }
  }

  let stopped = false
  const interval = setInterval(() => {
    if (stopped) {
      clearInterval(interval)
      return
    }
    tick()
  }, 2000)
  // 立刻拉一次，避免首屏空两秒
  tick()

  return () => {
    stopped = true
    clearInterval(interval)
    set({ transport: 'idle' })
  }
}
