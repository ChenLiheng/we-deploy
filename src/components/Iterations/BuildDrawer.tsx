import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Drawer, Tag, Spin } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, ClockCircleOutlined } from '@ant-design/icons'
import api from '@services/serverApi'
import type { BuildLog, BuildStatus } from '@/types'
import dayjs from 'dayjs'

interface BuildDrawerProps {
  buildId: string | null
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

const BuildDrawer: React.FC<BuildDrawerProps> = ({ buildId, visible, onClose }) => {
  const [logs, setLogs] = useState<BuildLog[]>([])
  const [status, setStatus] = useState<BuildStatus>('pending')
  const logsEndRef = useRef<HTMLDivElement>(null)
  const buildIdRef = useRef(buildId)

  const fetchBuild = useCallback(async () => {
    const id = buildIdRef.current
    if (!id) return
    try {
      const { data } = await api.get(`/builds/${id}`)
      setStatus(data.status)
    } catch { /* ignore */ }
  }, [])

  const fetchLogs = useCallback(async () => {
    const id = buildIdRef.current
    if (!id) return
    try {
      const { data } = await api.get(`/builds/${id}/logs`)
      setLogs(data)
    } catch { /* ignore */ }
  }, [])

  // Sync ref and reset when buildId changes
  useEffect(() => {
    buildIdRef.current = buildId
    if (visible && buildId) {
      setLogs([])
      setStatus('pending')
      fetchBuild()
      fetchLogs()
    }
  }, [buildId, visible, fetchBuild, fetchLogs])

  // Poll while drawer is open
  useEffect(() => {
    if (!visible || !buildIdRef.current) return

    const interval = setInterval(() => {
      fetchBuild()
      fetchLogs()
    }, 2000)

    return () => clearInterval(interval)
  }, [visible, fetchBuild, fetchLogs])

  // Auto scroll to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const currentStatus = statusConfig[status] || statusConfig.pending
  const isTerminal = ['success', 'failed'].includes(status)

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--geek-font-mono)', fontSize: 14, color: 'var(--geek-text-primary)' }}>
            $ 构建日志
          </span>
          <Tag style={{ color: currentStatus.color, borderColor: currentStatus.color, fontFamily: 'var(--geek-font-mono)', fontSize: 11 }}>
            {currentStatus.icon} {currentStatus.text}
          </Tag>
        </div>
      }
      placement="right"
      width={560}
      onClose={onClose}
      open={visible}
      styles={{
        body: {
          padding: 0,
          background: '#0d1117',
        },
        header: {
          background: 'var(--geek-bg-card)',
          borderBottom: '1px solid var(--geek-border-color)',
        },
        mask: {
          background: 'rgba(0, 0, 0, 0.45)',
        },
      }}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Terminal header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: '#1a1a2e',
          borderBottom: '1px solid var(--geek-border-color)',
          fontFamily: 'var(--geek-font-mono)',
          fontSize: 12,
          color: 'var(--geek-text-muted)',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
          </div>
          <span>build-output</span>
        </div>

        {/* Logs area */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px 16px',
          fontFamily: 'var(--geek-font-mono)',
          fontSize: 13,
          lineHeight: 1.7,
        }}>
          {!buildId && (
            <div style={{ color: 'var(--geek-text-muted)' }}>
              <span style={{ color: 'var(--geek-accent-green)' }}>$</span> 等待构建指令...
            </div>
          )}
          {buildId && logs.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--geek-text-muted)' }}>
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
              <span style={{ color: levelColorMap[log.level] || 'var(--geek-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {log.message}
              </span>
            </div>
          ))}
          {!isTerminal && logs.length > 0 && (
            <span style={{ color: 'var(--geek-accent-green)', animation: 'blink 1s step-end infinite' }}>
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
