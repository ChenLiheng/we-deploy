import { useEffect } from 'react'
import { useBuildConsoleStore } from '@stores/buildConsoleStore'

/**
 * 订阅某次构建的详情 + 实时日志。buildId 为空或 enabled=false 时不连接；
 * 组件卸载 / buildId 变化时自动断开，SSE 重连会补发完整历史，所以无需缓存。
 */
export function useBuildStream(buildId: string | null | undefined, enabled = true) {
  const connect = useBuildConsoleStore((s) => s.connect)
  const fetchBuild = useBuildConsoleStore((s) => s.fetchBuild)

  useEffect(() => {
    if (!buildId || !enabled) return
    const disconnect = connect(buildId)
    fetchBuild(buildId)
    return disconnect
  }, [buildId, enabled, connect, fetchBuild])
}
