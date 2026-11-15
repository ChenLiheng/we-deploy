import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Segmented, Space, Tooltip, App, ConfigProvider, theme } from 'antd'
import {
  CopyOutlined,
  DownloadOutlined,
  VerticalAlignBottomOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { BuildLog } from '@/types'

type LevelFilter = 'all' | 'warn' | 'error'

interface LogViewerProps {
  logs: BuildLog[]
  running: boolean
  emptyText?: string
  height?: number | string
  fileName?: string
}

/**
 * 构建日志查看器：
 *  - 自动跟随最新日志；用户向上滚动后暂停跟随，并出现「回到底部」按钮
 *  - 支持按级别筛选（全部 / 警告+错误 / 仅错误）与关键字搜索
 *  - 一键复制 / 下载完整日志，便于在群里排障
 */
const LogViewer: React.FC<LogViewerProps> = ({
  logs,
  running,
  emptyText = '暂无日志',
  height = 520,
  fileName = 'build.log',
}) => {
  const { message } = App.useApp()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)
  const [level, setLevel] = useState<LevelFilter>('all')
  const [keyword, setKeyword] = useState('')

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return logs.filter((l) => {
      if (level === 'error' && l.level !== 'error') return false
      if (level === 'warn' && l.level !== 'error' && l.level !== 'warn') return false
      if (kw && !l.message.toLowerCase().includes(kw)) return false
      return true
    })
  }, [logs, level, keyword])

  const counts = useMemo(
    () => ({
      warn: logs.filter((l) => l.level === 'warn').length,
      error: logs.filter((l) => l.level === 'error').length,
    }),
    [logs],
  )

  useEffect(() => {
    const el = bodyRef.current
    if (follow && el) el.scrollTop = el.scrollHeight
  }, [visible, follow])

  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    if (atBottom !== follow) setFollow(atBottom)
  }

  const plainText = () =>
    logs
      .map(
        (l) =>
          `[${dayjs(l.timestamp).format('YYYY-MM-DD HH:mm:ss')}] [${l.level.toUpperCase()}]${l.source ? ` [${l.source}]` : ''} ${l.message}`,
      )
      .join('\n')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText())
      message.success('日志已复制')
    } catch {
      message.error('复制失败，请使用下载')
    }
  }

  const handleDownload = () => {
    const blob = new Blob([plainText()], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        // 覆盖全局浅色主题的文字 / 背景基色，否则深色工具栏里的控件会继承深色文字
        token: { colorTextBase: '#e6e9ee', colorBgBase: '#0f1419', colorBgLayout: '#0b0f13' },
      }}
    >
      <div className="log-viewer">
        <div className="log-viewer__toolbar">
          <Segmented
            size="small"
            value={level}
            onChange={(v) => setLevel(v as LevelFilter)}
            options={[
              { label: `全部 ${logs.length}`, value: 'all' },
              { label: `警告/错误 ${counts.warn + counts.error}`, value: 'warn' },
              { label: `错误 ${counts.error}`, value: 'error' },
            ]}
          />
          <Space size={4} wrap>
            <Input
              size="small"
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索日志"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="log-viewer__search"
            />
            <Tooltip title="复制日志">
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={handleCopy}
                disabled={!logs.length}
              />
            </Tooltip>
            <Tooltip title="下载日志">
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={handleDownload}
                disabled={!logs.length}
              />
            </Tooltip>
          </Space>
        </div>
        <div className="log-viewer__body" ref={bodyRef} onScroll={handleScroll} style={{ height }}>
          {visible.length === 0 ? (
            <div className="log-viewer__empty">{logs.length ? '没有匹配的日志' : emptyText}</div>
          ) : (
            visible.map((log) => (
              <div key={log.id} className={`log-line log-line--${log.level}`}>
                <span className="log-line__time">{dayjs(log.timestamp).format('HH:mm:ss')}</span>
                {log.source && <span className="log-line__source">{log.source}</span>}
                <span className="log-line__msg">{log.message}</span>
              </div>
            ))
          )}
          {running && <div className="log-viewer__cursor" />}
        </div>
        {!follow && (
          <Button
            size="small"
            shape="round"
            icon={<VerticalAlignBottomOutlined />}
            className="log-viewer__follow"
            onClick={() => setFollow(true)}
          >
            回到最新
          </Button>
        )}
      </div>
    </ConfigProvider>
  )
}

export default LogViewer
