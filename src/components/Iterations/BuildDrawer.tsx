import React from 'react'
import { Drawer, Button, Space, Tooltip, Grid, Alert } from 'antd'
import { ExpandOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useBuildConsoleStore } from '@stores/buildConsoleStore'
import { useBuildStream } from '@/hooks/useBuildStream'
import LogViewer from '@components/common/LogViewer'
import BuildSteps from '@components/common/BuildSteps'
import { BuildStatusTag } from '@components/common/StatusTag'
import { formatDuration, isRunning } from '@/constants/status'

interface BuildDrawerProps {
  buildId: string | null
  projectId?: string
  title?: string
  open: boolean
  onClose: () => void
}

/** 迭代页内快速查看构建进度与日志；打开时订阅 SSE，关闭即断开（重新打开会补发完整历史） */
const BuildDrawer: React.FC<BuildDrawerProps> = ({ buildId, projectId, title, open, onClose }) => {
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const { logs, status, currentBuild, buildId: streamId } = useBuildConsoleStore()
  useBuildStream(buildId, open)

  const ready = streamId === buildId
  const running = isRunning(status)

  return (
    <Drawer
      title={
        <Space>
          <span>{title || '构建日志'}</span>
          {ready && <BuildStatusTag status={status} />}
        </Space>
      }
      extra={
        <Tooltip title="在完整页面中查看">
          <Button
            type="text"
            icon={<ExpandOutlined />}
            disabled={!buildId || !projectId}
            onClick={() => {
              onClose()
              navigate(`/projects/${projectId}/builds/${buildId}`)
            }}
          />
        </Tooltip>
      }
      placement="right"
      size={screens.md ? 680 : '100%'}
      onClose={onClose}
      open={open}
      destroyOnHidden
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 16 } }}
    >
      {ready && (
        <>
          <BuildSteps status={status} kind={currentBuild?.kind} />
          {currentBuild && (
            <div className="muted">
              v{currentBuild.version} · {currentBuild.branch} · 耗时{' '}
              {formatDuration(currentBuild.startTime, currentBuild.endTime)}
            </div>
          )}
          {status === 'failed' && currentBuild?.error && (
            <Alert type="error" showIcon title="构建失败" description={currentBuild.error} />
          )}
        </>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <LogViewer
          logs={ready ? logs : []}
          running={ready && running}
          height="calc(100vh - 300px)"
          emptyText="正在连接构建进程…"
          fileName={`${buildId}.log`}
        />
      </div>
    </Drawer>
  )
}

export default BuildDrawer
