import React, { useEffect, useRef } from 'react'
import { Drawer, Tag, Spin, Button, Space, Tooltip } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  ExpandAltOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useBuildConsoleStore } from '@stores/buildConsoleStore'
import type { BuildStatus } from '@/types'
import dayjs from 'dayjs'

interface BuildDrawerProps {
  buildId: string | null
  /** 用于"打开完整控制台"按钮跳转到 /projects/:projectId/builds/:buildId */
  projectId?: string
  visible: boolean
  onClose: () => void
}

const statusConfig: Record<BuildStatus, { color: string; icon: React.ReactNode; text: string }> = {
  pending: { color: '#8b949e', icon: <ClockCircleOutlined />, text: 'PENDING' },
  cloning: { color: '#58a6ff', icon: <SyncOutlined spin />, text: 'CLONING' },
  installing: { color: '#58a6ff', icon: <SyncOutlined spin />, text: 'INSTALLING' },
  building: { color: '#58a6ff', icon: <SyncOutlined spin />, text: 'BUILDING' },
  uploading: { color: '#bc8cff', icon: <SyncOutlined spin />, text: 'UPLOADING' },
  success: { color: '#3fb950', icon: <CheckCircleOutlined />, text: 'SUCCESS' },
  failed: { color: '#ff7b72', icon: <CloseCircleOutlined />, text: 'FAILED' },
}

const levelColorMap: Record<string, string> = {
  info: 'var(--geek-text-primary)',
  warn: 'var(--geek-accent-yellow)',
  error: 'var(--geek-accent-red)',
  success: 'var(--geek-accent-green)',
}

/**
 * 迭代页内的构建日志抽屉。
 *
 * 与 BuildConsole 全屏页共享 useBuildConsoleStore，复用同一份 SSE 连接：
 *  - SSE 优先 + 自动降级到 2s 轮询（store 内置）
 *  - 单连接保护（store 内 activeDisconnect 句柄）
 *
 * 设计要点（解决两类老问题）：
 *  1. 之前抽屉用本地 state + 2s 轮询，现在直接读 store，自动获得 SSE 实时推送。
 *  2. 之前关闭抽屉就丢日志，再次打开只能去构建历史；现在关闭抽屉不会断开订阅，
 *     重新打开（同一 buildId）能立刻看到完整日志和后续推送。
 *  3. 当 buildId 变化（用户切到另一条迭代触发构建）才 reconnect；同 buildId 反复
 *     开关抽屉不会触发不必要的 clearConsole + 重新拉取历史。
 */
const BuildDrawer: React.FC<BuildDrawerProps> = ({ buildId, projectId, visible, onClose }) => {
  const navigate = useNavigate()
  const { logs, status, transport, fetchBuild, connectStream, clearConsole } =
    useBuildConsoleStore()
  const logsEndRef = useRef<HTMLDivElement>(null)

  /**
   * 仅当 buildId 真正变化时才触发重连，否则反复开关抽屉会浪费一次"清空 + 重拉"。
   * 注意：组件卸载时不调用 disconnect，让订阅持续到 build 终态——这样用户切走再回来，
   * 抽屉里仍是已订阅的最新状态，不会丢日志。
   */
  const lastConnectedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!buildId) return
    if (lastConnectedIdRef.current === buildId) return

    lastConnectedIdRef.current = buildId
    clearConsole()
    fetchBuild(buildId)
    connectStream(buildId)
  }, [buildId, fetchBuild, connectStream, clearConsole])

  // Auto scroll：抽屉打开 + 有新日志时滚到底
  useEffect(() => {
    if (visible) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, visible])

  const currentStatus = statusConfig[status] || statusConfig.pending
  const isTerminal = ['success', 'failed'].includes(status)

  const handleOpenConsole = () => {
    if (!buildId) return
    if (projectId) {
      navigate(`/projects/${projectId}/builds/${buildId}`)
    } else {
      navigate(`/builds/${buildId}`)
    }
    onClose()
  }

  const handleReconnect = () => {
    if (!buildId) return
    clearConsole()
    fetchBuild(buildId)
    connectStream(buildId)
    // 强制下一次 effect 不被 lastConnectedIdRef 拦截
    lastConnectedIdRef.current = buildId
  }

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              fontFamily: 'var(--geek-font-mono)',
              fontSize: 14,
              color: 'var(--geek-text-primary)',
            }}
          >
            $ 构建日志
          </span>
          <Tag
            style={{
              color: currentStatus.color,
              borderColor: currentStatus.color,
              fontFamily: 'var(--geek-font-mono)',
              fontSize: 11,
            }}
          >
            {currentStatus.icon} {currentStatus.text}
          </Tag>
          {/* 与 BuildConsole 一致的传输通道角标，让用户知道当前是 SSE 还是降级轮询 */}
          {transport !== 'idle' && (
            <Tag
              style={{
                fontFamily: 'var(--geek-font-mono)',
                fontSize: 10,
                color:
                  transport === 'sse' ? 'var(--geek-accent-green)' : 'var(--geek-accent-yellow)',
                borderColor:
                  transport === 'sse' ? 'var(--geek-accent-green)' : 'var(--geek-accent-yellow)',
              }}
            >
              {transport === 'sse' ? 'STREAM' : 'POLLING'}
            </Tag>
          )}
        </div>
      }
      extra={
        <Space size={4}>
          <Tooltip title="重新连接 / 刷新历史">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleReconnect}
              disabled={!buildId}
            />
          </Tooltip>
          <Tooltip title="打开完整控制台">
            <Button
              type="text"
              size="small"
              icon={<ExpandAltOutlined />}
              onClick={handleOpenConsole}
              disabled={!buildId}
            />
          </Tooltip>
        </Space>
      }
      placement="right"
      width={560}
      onClose={onClose}
      open={visible}
      // 关闭抽屉时不销毁内部状态：drawer 关上后 store 仍持续接收 SSE 推送，
      // 用户再次打开同一 buildId 时立刻看到最新日志，不会再次"从空开始"。
      destroyOnClose={false}
      styles={{
        body: { padding: 0, background: '#0d1117' },
        header: {
          background: 'var(--geek-bg-card)',
          borderBottom: '1px solid var(--geek-border-color)',
        },
        mask: { background: 'rgba(0, 0, 0, 0.45)' },
      }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Terminal header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: '#1a1a2e',
            borderBottom: '1px solid var(--geek-border-color)',
            fontFamily: 'var(--geek-font-mono)',
            fontSize: 12,
            color: 'var(--geek-text-muted)',
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
          </div>
          <span>build-output</span>
          {isTerminal && <span style={{ marginLeft: 'auto' }}>—— 任务已结束</span>}
        </div>

        {/* Logs area */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '12px 16px',
            fontFamily: 'var(--geek-font-mono)',
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          {!buildId && (
            <div style={{ color: 'var(--geek-text-muted)' }}>
              <span style={{ color: 'var(--geek-accent-green)' }}>$</span> 等待构建指令...
            </div>
          )}
          {buildId && logs.length === 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                color: 'var(--geek-text-muted)',
              }}
            >
              <Spin size="small" />
              <span>正在连接构建进程...</span>
            </div>
          )}
          {logs.map((log) => (
            <div key={log.id} style={{ display: 'flex', gap: 8, padding: '1px 0' }}>
              <span style={{ color: '#636d83', flexShrink: 0 }}>
                [{dayjs(log.timestamp).format('HH:mm:ss')}]
              </span>
              {log.source && (
                <span style={{ color: '#58a6ff', flexShrink: 0 }}>[{log.source}]</span>
              )}
              <span
                style={{
                  color: levelColorMap[log.level] || 'var(--geek-text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {log.message}
              </span>
            </div>
          ))}
          {!isTerminal && logs.length > 0 && (
            <span
              style={{
                color: 'var(--geek-accent-green)',
                animation: 'blink 1s step-end infinite',
              }}
            >
              {'█'}
            </span>
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </Drawer>
  )
}

export default BuildDrawer
