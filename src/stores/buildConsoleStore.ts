import { create } from 'zustand'
import api from '@services/serverApi'
import type { BuildRecord, BuildLog, BuildStatus } from '@/types'
import { getStoredAuthToken } from './authStore'
import { isTerminal } from '@/constants/status'

/**
 * 日志通道：
 *  - 'sse'      浏览器原生 EventSource 实时推送（首选）
 *  - 'polling'  SSE 不可用时降级为 2s 增量轮询
 *  - 'idle'     未连接 / 已结束
 */
export type LogTransport = 'idle' | 'sse' | 'polling'

interface BuildConsoleState {
  buildId: string | null
  currentBuild: BuildRecord | null
  logs: BuildLog[]
  status: BuildStatus
  /** 已收到日志的最大 timestamp，作为增量拉取 / 去重游标（后端保证严格递增） */
  lastLogTs: number
  transport: LogTransport
  /** 构建记录不存在（404） */
  notFound: boolean
  fetchBuild: (buildId: string) => Promise<void>
  /** 启动实时日志订阅，返回 cleanup。重复调用会先关闭旧连接 */
  connect: (buildId: string) => () => void
  reset: () => void
}

type SetState = (
  partial: Partial<BuildConsoleState> | ((s: BuildConsoleState) => Partial<BuildConsoleState>),
) => void

function appendAccessToken(url?: string): string | undefined {
  const token = getStoredAuthToken()
  if (!url || !token) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}access_token=${encodeURIComponent(token)}`
}

/** 二维码图片走 <img>，无法带 Authorization 头，需要拼上 access_token */
function normalizeBuild(raw: BuildRecord): BuildRecord {
  return { ...raw, qrcodeUrl: appendAccessToken(raw.qrcodeUrl) }
}

function mergeLogs(state: BuildConsoleState, incoming: BuildLog[]): Partial<BuildConsoleState> {
  const fresh = incoming.filter((l) => l.timestamp > state.lastLogTs)
  if (fresh.length === 0) return {}
  return {
    logs: [...state.logs, ...fresh],
    lastLogTs: fresh[fresh.length - 1].timestamp,
  }
}

let activeDisconnect: (() => void) | null = null

export const useBuildConsoleStore = create<BuildConsoleState>((set, get) => ({
  buildId: null,
  currentBuild: null,
  logs: [],
  status: 'pending',
  lastLogTs: 0,
  transport: 'idle',
  notFound: false,

  reset: () =>
    set({ currentBuild: null, logs: [], lastLogTs: 0, status: 'pending', transport: 'idle' }),

  fetchBuild: async (buildId) => {
    try {
      const { data } = await api.get<BuildRecord>(`/builds/${buildId}`)
      if (get().buildId !== buildId) return
      set((state) => ({
        currentBuild: normalizeBuild(data),
        status: data.status,
        ...mergeLogs(state, data.logs || []),
      }))
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404 && get().buildId === buildId) set({ notFound: true })
    }
  },

  connect: (buildId) => {
    if (activeDisconnect) activeDisconnect()
    set({ buildId, currentBuild: null, logs: [], lastLogTs: 0, status: 'pending', notFound: false })
    const disconnect =
      typeof window.EventSource === 'undefined'
        ? startPolling(buildId, set, get)
        : startSSE(buildId, set, get)
    activeDisconnect = disconnect
    return () => {
      disconnect()
      if (activeDisconnect === disconnect) activeDisconnect = null
    }
  },
}))

function startSSE(buildId: string, set: SetState, get: () => BuildConsoleState): () => void {
  // EventSource 无法携带 Authorization 头，使用 access_token 查询参数
  const url = appendAccessToken(`/api/builds/${buildId}/logs/stream`)!
  let es: EventSource | null = new EventSource(url)
  let fallbackCleanup: (() => void) | null = null
  let errors = 0
  let closed = false

  set({ transport: 'sse' })

  es.addEventListener('log', (e) => {
    errors = 0
    try {
      const log = JSON.parse((e as MessageEvent).data) as BuildLog
      set((state) => mergeLogs(state, [log]))
    } catch {
      /* 单条解析失败忽略 */
    }
  })

  es.addEventListener('status', (e) => {
    errors = 0
    try {
      const { status } = JSON.parse((e as MessageEvent).data) as { status: BuildStatus }
      const prev = get().status
      set({ status })
      // 进入终态时刷新一次构建详情（结束时间 / 错误信息 / 二维码等）
      if (isTerminal(status) && !isTerminal(prev)) get().fetchBuild(buildId)
    } catch {
      /* ignore */
    }
  })

  es.addEventListener('end', () => {
    closed = true
    es?.close()
    es = null
    set({ transport: 'idle' })
    get().fetchBuild(buildId)
  })

  es.addEventListener('error', () => {
    if (closed) return
    if (es?.readyState === EventSource.CLOSED) {
      errors += 1
      es = null
      // 连接被彻底关闭（非浏览器自动重连）→ 降级轮询，保证日志可达
      fallbackCleanup = startPolling(buildId, set, get)
    } else if (++errors >= 5) {
      es?.close()
      es = null
      fallbackCleanup = startPolling(buildId, set, get)
    }
  })

  return () => {
    closed = true
    es?.close()
    es = null
    fallbackCleanup?.()
    fallbackCleanup = null
    set({ transport: 'idle' })
  }
}

function startPolling(buildId: string, set: SetState, get: () => BuildConsoleState): () => void {
  let stopped = false
  set({ transport: 'polling' })

  const tick = async () => {
    if (stopped) return
    try {
      const { lastLogTs } = get()
      const { data: logs } = await api.get<BuildLog[]>(`/builds/${buildId}/logs`, {
        params: lastLogTs > 0 ? { since: lastLogTs } : undefined,
      })
      if (stopped) return
      if (Array.isArray(logs)) set((state) => mergeLogs(state, logs))
      const { data: build } = await api.get<BuildRecord>(`/builds/${buildId}`)
      if (stopped) return
      set({ currentBuild: normalizeBuild(build), status: build.status })
      if (isTerminal(build.status)) {
        stop()
        return
      }
    } catch {
      /* 瞬时错误忽略，下一轮自动恢复 */
    }
  }

  const timer = setInterval(tick, 2000)
  tick()

  function stop() {
    stopped = true
    clearInterval(timer)
    set({ transport: 'idle' })
  }
  return stop
}
