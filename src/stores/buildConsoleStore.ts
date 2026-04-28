import { create } from 'zustand'
import api from '@services/serverApi'
import type { BuildRecord, BuildLog, BuildStatus } from '@/types'

interface BuildConsoleState {
  currentBuild: BuildRecord | null
  logs: BuildLog[]
  isStreaming: boolean
  status: BuildStatus
  /**
   * 已收到日志中的最大 timestamp，作为下一次增量拉取的 since 游标。
   * 0 表示尚未拉过任何日志。
   * 服务端用 `timestamp > since` 做严格大于判断，所以同毫秒多条不会丢；
   * 重复的请求只会拿到新增条目，避免单次响应随时间膨胀。
   */
  lastLogTs: number
  setBuild: (build: BuildRecord) => void
  addLog: (log: Omit<BuildLog, 'id' | 'timestamp'>) => void
  addLogs: (logs: Omit<BuildLog, 'id' | 'timestamp'>[]) => void
  updateStatus: (status: BuildStatus) => void
  setStreaming: (streaming: boolean) => void
  clearConsole: () => void
  fetchBuild: (buildId: string) => Promise<void>
  fetchBuildLogs: (buildId: string) => Promise<void>
}

export const useBuildConsoleStore = create<BuildConsoleState>((set, get) => ({
  currentBuild: null,
  logs: [],
  isStreaming: false,
  status: 'pending',
  lastLogTs: 0,

  setBuild: (build) =>
    set({
      currentBuild: build,
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
  clearConsole: () => set({ logs: [], lastLogTs: 0 }),

  fetchBuild: async (buildId: string) => {
    try {
      const { data } = await api.get(`/builds/${buildId}`)
      set({
        currentBuild: data,
        status: data.status,
      })
    } catch {
      // build not found yet
    }
  },

  fetchBuildLogs: async (buildId: string) => {
    try {
      const { lastLogTs } = get()
      // 仅拉取增量：以已知最大 timestamp 作为游标，避免每次都拉全量
      // 首次（lastLogTs === 0）走全量分支，后续都走增量
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
}))
