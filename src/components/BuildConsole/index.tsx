import React, { useEffect, useRef, useState } from 'react'
import { Card, Button, Tag, Space, Image, message } from 'antd'
import {
  ReloadOutlined,
  ClearOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  QrcodeOutlined,
} from '@ant-design/icons'
import { useParams } from 'react-router-dom'
import { useBuildConsoleStore } from '@stores/buildConsoleStore'
import api from '@services/serverApi'
import type { BuildStatus } from '@/types'
import dayjs from 'dayjs'
import './BuildConsole.less'

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

const BuildConsole: React.FC = () => {
  const { buildId } = useParams<{ projectId: string; buildId: string }>()
  const { currentBuild, logs, status, transport, fetchBuild, clearConsole } =
    useBuildConsoleStore()
  const consoleEndRef = useRef<HTMLDivElement>(null)
  const [previewing, setPreviewing] = useState(false)

  const handlePreview = async () => {
    if (!buildId) return
    setPreviewing(true)
    try {
      await api.post(`/builds/${buildId}/preview`, { pagePath: undefined })
      message.success('预览构建已触发')
    } catch {
      message.error('预览构建触发失败')
    } finally {
      setPreviewing(false)
    }
  }

  useEffect(() => {
    if (!buildId) return

    // 切换到新的 build 时先清空旧日志和增量游标，避免 lastLogTs 残留
    // 导致首次拉取走错增量分支、漏掉早期日志
    clearConsole()
    fetchBuild(buildId)

    // 启动实时日志通道：SSE 优先，失败自动降级到 2s 轮询
    // connectStream 内部已经做了首次全量拉取，无需再单独 fetchBuildLogs
    const disconnect = useBuildConsoleStore.getState().connectStream(buildId)
    return () => disconnect()
  }, [buildId, fetchBuild, clearConsole])

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const currentStatus = statusConfig[status] || statusConfig.pending
  const isTerminal = ['success', 'failed'].includes(status)

  return (
    <div className="build-console-page">
      <div className="page-header">
        <div className="header-title">
          <span className="prompt">$</span>
          <h1>构建控制台</h1>
          <Tag
            className="status-tag"
            style={{ color: currentStatus.color, borderColor: currentStatus.color }}
          >
            {currentStatus.icon} {currentStatus.text}
          </Tag>
          {/* 日志通道角标：用极简样式提示当前是 SSE 还是降级轮询 */}
          {transport !== 'idle' && (
            <Tag
              className="transport-tag"
              style={{
                marginLeft: 4,
                fontFamily: 'var(--geek-font-mono)',
                fontSize: 10,
                color:
                  transport === 'sse'
                    ? 'var(--geek-accent-green)'
                    : 'var(--geek-accent-yellow)',
                borderColor:
                  transport === 'sse'
                    ? 'var(--geek-accent-green)'
                    : 'var(--geek-accent-yellow)',
              }}
            >
              {transport === 'sse' ? 'STREAM' : 'POLLING'}
            </Tag>
          )}
        </div>
        <Space>
          {status === 'success' && currentBuild?.qrcodeUrl && (
            <Button
              icon={<QrcodeOutlined />}
              className="geek-button-outline"
              onClick={() => window.open(currentBuild.qrcodeUrl!, '_blank')}
            >
              查看二维码
            </Button>
          )}
          {status === 'success' && !currentBuild?.qrcodeUrl && (
            <Button
              icon={<QrcodeOutlined />}
              className="geek-button"
              onClick={handlePreview}
              loading={previewing}
            >
              上传预览
            </Button>
          )}
          <Button
            icon={<ReloadOutlined />}
            className="geek-button"
            onClick={() => {
              // 刷新：清空 + 重新连接（自动重新走 SSE，断线后切换通道也用这个）
              if (!buildId) return
              clearConsole()
              fetchBuild(buildId)
              useBuildConsoleStore.getState().connectStream(buildId)
            }}
          >
            刷新
          </Button>
          <Button icon={<ClearOutlined />} className="geek-button-outline" onClick={clearConsole}>
            清空日志
          </Button>
        </Space>
      </div>

      {status === 'success' && currentBuild?.qrcodeUrl && (
        <Card className="geek-card qrcode-card" style={{ marginBottom: 16 }}>
          <div className="qrcode-container" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontFamily: 'var(--geek-font-mono)', fontSize: 12, color: 'var(--geek-text-secondary)', marginBottom: 12 }}>
              $ 预览二维码
            </div>
            <Image
              src={currentBuild.qrcodeUrl}
              alt="预览二维码"
              width={280}
              style={{ border: '1px solid var(--geek-border-color)', borderRadius: 8 }}
            />
          </div>
        </Card>
      )}

      <Card className="console-card">
        <div className="console-header">
          <div className="console-dots">
            <span className="dot red"></span>
            <span className="dot yellow"></span>
            <span className="dot green"></span>
          </div>
          <span className="console-title">build-output — bash</span>
        </div>
        <div className="console-body">
          {logs.length === 0 && (
            <div className="console-empty">
              <span className="prompt-line">
                <span className="prompt-char">$</span> 等待构建指令...
              </span>
              <span className="cursor-blink">{'█'}</span>
            </div>
          )}
          {logs.map((log) => (
            <div key={log.id} className={`log-line ${log.level}`}>
              <span className="log-time">
                [{dayjs(log.timestamp).format('HH:mm:ss')}]
              </span>
              {log.source && <span className="log-source">[{log.source}]</span>}
              <span className="log-message" style={{ color: levelColorMap[log.level] }}>
                {log.message}
              </span>
            </div>
          ))}
          {!isTerminal && logs.length > 0 && (
            <div className="streaming-indicator">
              <span className="cursor-blink">{'█'}</span>
            </div>
          )}
          <div ref={consoleEndRef} />
        </div>
      </Card>
    </div>
  )
}

export default BuildConsole
