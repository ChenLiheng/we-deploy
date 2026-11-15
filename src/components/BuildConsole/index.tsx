import React, { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Button,
  Space,
  Image,
  Alert,
  Descriptions,
  Row,
  Col,
  App,
  Result,
  Spin,
  Tooltip,
  Tag,
} from 'antd'
import { ArrowLeftOutlined, QrcodeOutlined, ReloadOutlined, WifiOutlined } from '@ant-design/icons'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useBuildConsoleStore } from '@stores/buildConsoleStore'
import { useProjectStore } from '@stores/projectStore'
import { useBuildStream } from '@/hooks/useBuildStream'
import api, { getErrorMessage } from '@services/serverApi'
import PageHeader from '@components/common/PageHeader'
import LogViewer from '@components/common/LogViewer'
import BuildSteps from '@components/common/BuildSteps'
import { BuildStatusTag, EnvTag, PreviewTag } from '@components/common/StatusTag'
import { formatDuration, formatTime, isRunning } from '@/constants/status'
import type { BuildRecord, BuildStatus } from '@/types'

/** 根据日志推断失败发生在哪个阶段（日志 source 与流水线阶段对应） */
const SOURCE_TO_STEP: Record<string, BuildStatus> = {
  git: 'cloning',
  npm: 'installing',
  build: 'building',
  ci: 'uploading',
}

const BuildConsole: React.FC = () => {
  const { buildId } = useParams<{ projectId: string; buildId: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const {
    currentBuild,
    logs,
    status,
    transport,
    notFound,
    buildId: streamId,
    connect,
    fetchBuild,
  } = useBuildConsoleStore()
  const { projects, fetchProjects } = useProjectStore()
  const [previewing, setPreviewing] = useState(false)
  const [, forceTick] = useState(0)

  useBuildStream(buildId)

  useEffect(() => {
    if (projects.length === 0) fetchProjects()
  }, [projects.length, fetchProjects])

  const running = isRunning(status)
  // 运行中每秒刷新一次耗时显示
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [running])

  const failedAt = useMemo(() => {
    if (status !== 'failed') return undefined
    for (let i = logs.length - 1; i >= 0; i--) {
      const step = SOURCE_TO_STEP[logs[i].source || '']
      if (step) return step
    }
    return undefined
  }, [status, logs])

  const ready = streamId === buildId && !!currentBuild
  const build = currentBuild as BuildRecord | null
  const project = projects.find((p) => p.id === build?.projectId)

  const handlePreview = async () => {
    if (!buildId || !build) return
    setPreviewing(true)
    try {
      const { data } = await api.post<BuildRecord>(`/builds/${buildId}/preview`, {})
      message.success('预览构建已加入队列')
      navigate(`/projects/${data.projectId}/builds/${data.id}`)
    } catch (err) {
      message.error(getErrorMessage(err, '预览触发失败'))
    } finally {
      setPreviewing(false)
    }
  }

  if (notFound && streamId === buildId) {
    return (
      <Result
        status="404"
        title="构建记录不存在"
        subTitle="该记录可能已被保留策略清理或随项目删除"
        extra={<Button onClick={() => navigate('/builds')}>返回构建记录</Button>}
      />
    )
  }

  if (!ready || !build) {
    return (
      <div className="fullscreen-center fullscreen-center--inline">
        <Spin size="large" />
      </div>
    )
  }

  const isPreview = build.kind === 'preview'

  return (
    <div className="page">
      <PageHeader
        back={
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            aria-label="返回"
          />
        }
        title={
          <Space size={8} wrap>
            <span>
              {project?.name || '构建详情'} <span className="mono">v{build.version}</span>
            </span>
            <EnvTag env={build.environment} />
            {isPreview && <PreviewTag />}
            <BuildStatusTag status={status} />
          </Space>
        }
        description={<span className="mono muted">{build.id}</span>}
        extra={
          <Space wrap>
            {!isPreview && !running && (
              <Tooltip title="使用相同分支和版本生成一个可扫码体验的预览版">
                <Button icon={<QrcodeOutlined />} onClick={handlePreview} loading={previewing}>
                  生成预览二维码
                </Button>
              </Tooltip>
            )}
            {isPreview && !running && (
              <Button icon={<ReloadOutlined />} onClick={handlePreview} loading={previewing}>
                重新生成预览
              </Button>
            )}
          </Space>
        }
      />

      <Card variant="borderless" className="section">
        <BuildSteps status={status} failedAt={failedAt} size="medium" kind={build.kind} />
      </Card>

      {status === 'failed' && build.error && (
        <Alert
          className="section"
          type="error"
          showIcon
          title="构建失败"
          description={build.error}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={build.qrcodeUrl ? 16 : 24}>
          <Card variant="borderless" className="section">
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2, lg: 3 }}
              items={[
                {
                  key: 'project',
                  label: '项目',
                  children: project ? (
                    <Link to={`/projects/${project.id}/config`}>{project.name}</Link>
                  ) : (
                    '-'
                  ),
                },
                {
                  key: 'branch',
                  label: '分支',
                  children: <span className="mono">{build.branch || '-'}</span>,
                },
                {
                  key: 'commit',
                  label: 'Commit',
                  children: <span className="mono">{build.commitHash?.slice(0, 7) || '-'}</span>,
                },
                { key: 'trigger', label: '触发人', children: build.triggerBy || '系统' },
                {
                  key: 'start',
                  label: '开始时间',
                  children: formatTime(build.startTime, 'YYYY-MM-DD HH:mm:ss'),
                },
                {
                  key: 'duration',
                  label: '耗时',
                  children: formatDuration(build.startTime, running ? undefined : build.endTime),
                },
                ...(build.sourceBuildId
                  ? [
                      {
                        key: 'source',
                        label: '来源构建',
                        children: (
                          <Link
                            className="mono"
                            to={`/projects/${build.projectId}/builds/${build.sourceBuildId}`}
                          >
                            {build.sourceBuildId}
                          </Link>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Card>
        </Col>
        {build.qrcodeUrl && status === 'success' && (
          <Col xs={24} xl={8}>
            <Card variant="borderless" className="section qrcode-card" title="预览二维码">
              <Image src={build.qrcodeUrl} alt="预览二维码" width={200} />
              <p className="muted">使用微信扫码体验预览版，二维码有效期以微信官方为准。</p>
            </Card>
          </Col>
        )}
      </Row>

      <Card
        variant="borderless"
        title="构建日志"
        extra={
          <Space size={8}>
            {transport !== 'idle' && (
              <Tag
                variant="filled"
                color={transport === 'sse' ? 'success' : 'warning'}
                icon={<WifiOutlined />}
              >
                {transport === 'sse' ? '实时' : '轮询'}
              </Tag>
            )}
            <Tooltip title="重新连接并加载完整日志">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => {
                  if (!buildId) return
                  connect(buildId)
                  fetchBuild(buildId)
                }}
              />
            </Tooltip>
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        <LogViewer
          logs={logs}
          running={running}
          height="max(420px, calc(100vh - 520px))"
          emptyText={status === 'queued' ? '排队中，等待空闲构建槽位…' : '暂无日志'}
          fileName={`${build.id}.log`}
        />
      </Card>
    </div>
  )
}

export default BuildConsole
