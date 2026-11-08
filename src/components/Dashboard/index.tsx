import React, { useEffect, useMemo } from 'react'
import { Row, Col, Card, Button, Space, Empty, Steps, Skeleton, Tooltip } from 'antd'
import {
  PlusOutlined,
  SettingOutlined,
  RocketOutlined,
  RightOutlined,
  WarningOutlined,
  BranchesOutlined,
} from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { useProjectStore } from '@stores/projectStore'
import { useAuthStore } from '@stores/authStore'
import PageHeader from '@components/common/PageHeader'
import { BuildStatusTag, EnvTag, PreviewTag } from '@components/common/StatusTag'
import { formatDuration, formatSeconds, fromNow, isRunning } from '@/constants/status'
import type { BuildRecord, EnvironmentType, ProjectConfig } from '@/types'

const StatCard: React.FC<{
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: string
}> = ({ label, value, hint, tone }) => (
  <Card className="stat-card" variant="borderless">
    <div className="stat-card__label">{label}</div>
    <div className="stat-card__value" style={tone ? { color: tone } : undefined}>
      {value}
    </div>
    {hint && <div className="stat-card__hint">{hint}</div>}
  </Card>
)

const BuildRow: React.FC<{ build: BuildRecord; projectName: string }> = ({
  build,
  projectName,
}) => {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="build-row"
      onClick={() => navigate(`/projects/${build.projectId}/builds/${build.id}`)}
    >
      <div className="build-row__main">
        <div className="build-row__title">
          <span className="build-row__project">{projectName}</span>
          <code className="mono">v{build.version}</code>
          <EnvTag env={build.environment} short />
          {build.kind === 'preview' && <PreviewTag />}
        </div>
        <div className="build-row__meta">
          <BranchesOutlined /> {build.branch || '-'} · {build.triggerBy || '系统'} ·{' '}
          {fromNow(build.startTime)}
          {build.endTime && ` · 耗时 ${formatDuration(build.startTime, build.endTime)}`}
        </div>
      </div>
      <BuildStatusTag status={build.status} />
    </button>
  )
}

const ProjectCard: React.FC<{
  project: ProjectConfig
  latest: Partial<Record<EnvironmentType, BuildRecord>>
}> = ({ project, latest }) => {
  const navigate = useNavigate()
  // 公开仓库不需要 Token，因此只把「上传密钥」视为必需配置
  const missing: string[] = []
  if (!project.hasPrivateKey) missing.push('上传密钥')
  if (project.authType === 'ssh' && !project.sshKeyPath) missing.push('SSH 私钥路径')

  return (
    <Card className="project-card" variant="borderless">
      <div className="project-card__head">
        <div className="project-card__avatar">{project.name.slice(0, 1)}</div>
        <div className="project-card__title">
          <Link to={`/projects/${project.id}/config`}>{project.name}</Link>
          <code className="mono muted">{project.appId}</code>
        </div>
        <Tooltip title="项目配置">
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => navigate(`/projects/${project.id}/config`)}
          />
        </Tooltip>
      </div>

      {missing.length > 0 && (
        <Link to={`/projects/${project.id}/config`} className="project-card__warn">
          <WarningOutlined /> 尚未配置{missing.join('、')}，构建会失败
        </Link>
      )}

      <div className="project-card__envs">
        {(['dev', 'prod'] as EnvironmentType[]).map((env) => {
          const b = latest[env]
          return (
            <div key={env} className="env-cell">
              <div className="env-cell__head">
                <EnvTag env={env} />
                {b ? <BuildStatusTag status={b.status} /> : <span className="muted">暂无构建</span>}
              </div>
              <div className="env-cell__meta">
                {b ? (
                  <Link to={`/projects/${project.id}/builds/${b.id}`}>
                    v{b.version} · {fromNow(b.startTime)}
                  </Link>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Button
        block
        icon={<RocketOutlined />}
        onClick={() => navigate(`/iterations?create=1&projectId=${project.id}`)}
      >
        发布新版本
      </Button>
    </Card>
  )
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { projects, builds, fetchProjects, fetchBuilds, projectsLoaded } = useProjectStore()

  useEffect(() => {
    fetchProjects()
    fetchBuilds()
  }, [fetchProjects, fetchBuilds])

  const running = useMemo(() => builds.filter((b) => isRunning(b.status)), [builds])

  // 有构建在跑时每 5 秒静默刷新，状态自动更新
  useEffect(() => {
    if (running.length === 0) return
    const timer = setInterval(() => fetchBuilds({ silent: true }), 5000)
    return () => clearInterval(timer)
  }, [running.length, fetchBuilds])

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]))
    return (id: string) => map.get(id) || '已删除项目'
  }, [projects])

  const stats = useMemo(() => {
    const since = dayjs().subtract(7, 'day')
    const recent = builds.filter((b) => dayjs(b.startTime).isAfter(since))
    const finished = recent.filter((b) => b.status === 'success' || b.status === 'failed')
    const success = finished.filter((b) => b.status === 'success').length
    const durations = finished
      .filter((b) => b.status === 'success' && b.endTime && b.kind !== 'preview')
      .map((b) => dayjs(b.endTime).diff(dayjs(b.startTime), 'second'))
    const avg = durations.length
      ? Math.round(durations.reduce((a, c) => a + c, 0) / durations.length)
      : 0
    return {
      recentCount: recent.length,
      failed: finished.length - success,
      rate: finished.length ? Math.round((success / finished.length) * 100) : null,
      avg,
    }
  }, [builds])

  const latestByProject = useMemo(() => {
    const result: Record<string, Partial<Record<EnvironmentType, BuildRecord>>> = {}
    // builds 已按开始时间倒序，第一次出现即最新；预览构建不计入版本状态
    for (const b of builds) {
      if (b.kind === 'preview') continue
      const entry = (result[b.projectId] ||= {})
      if (!entry[b.environment]) entry[b.environment] = b
    }
    return result
  }, [builds])

  const recentBuilds = builds.slice(0, 8)
  const hello = (() => {
    const h = dayjs().hour()
    if (h < 6) return '夜深了'
    if (h < 12) return '早上好'
    if (h < 18) return '下午好'
    return '晚上好'
  })()

  return (
    <div className="page">
      <PageHeader
        title="工作台"
        description={`${hello}，${user?.displayName || user?.username || ''}。这里是所有小程序的发布概况。`}
        extra={
          <Space wrap>
            <Button icon={<PlusOutlined />} onClick={() => navigate('/projects?create=1')}>
              新建项目
            </Button>
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={() => navigate('/iterations?create=1')}
              disabled={projects.length === 0}
            >
              发布新版本
            </Button>
          </Space>
        }
      />

      {!projectsLoaded ? (
        <Card variant="borderless">
          <Skeleton active />
        </Card>
      ) : projects.length === 0 ? (
        <Card variant="borderless" className="onboarding">
          <h2>三步完成第一次发布</h2>
          <p className="muted">
            WeDeploy 会拉取你的仓库代码，在服务器上编译并通过 miniprogram-ci 上传到微信后台。
          </p>
          <Steps
            orientation="vertical"
            current={0}
            items={[
              { title: '创建项目', description: '填写小程序 AppID 与 Git 仓库地址' },
              {
                title: '配置凭证',
                description:
                  '在微信公众平台「开发管理 → 开发设置 → 小程序代码上传」下载上传密钥，并添加服务器 IP 白名单',
              },
              {
                title: '新建迭代并构建',
                description: '选择分支、版本号和环境，一键上传或生成预览二维码',
              },
            ]}
          />
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => navigate('/projects?create=1')}
          >
            创建第一个项目
          </Button>
        </Card>
      ) : (
        <>
          <Row gutter={[16, 16]} className="section">
            <Col xs={12} lg={6}>
              <StatCard label="项目" value={projects.length} hint={`共 ${builds.length} 次构建`} />
            </Col>
            <Col xs={12} lg={6}>
              <StatCard
                label="近 7 天构建"
                value={stats.recentCount}
                hint={
                  stats.failed > 0 ? (
                    <span className="text-danger">{stats.failed} 次失败</span>
                  ) : (
                    '无失败'
                  )
                }
              />
            </Col>
            <Col xs={12} lg={6}>
              <StatCard
                label="近 7 天成功率"
                value={stats.rate === null ? '—' : `${stats.rate}%`}
                tone={stats.rate === null ? undefined : stats.rate >= 80 ? '#07c160' : '#f53f3f'}
                hint={stats.avg ? `平均耗时 ${formatSeconds(stats.avg)}` : '暂无数据'}
              />
            </Col>
            <Col xs={12} lg={6}>
              <StatCard
                label="进行中"
                value={running.length}
                tone={running.length ? '#1677ff' : undefined}
                hint={running.length ? '自动刷新中' : '队列空闲'}
              />
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={14}>
              <Card
                title="最近构建"
                variant="borderless"
                extra={
                  <Link to="/builds">
                    全部 <RightOutlined />
                  </Link>
                }
                className="list-card"
              >
                {recentBuilds.length === 0 ? (
                  <Empty
                    description="还没有构建记录，去迭代发布页触发第一次构建吧"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  >
                    <Button type="primary" onClick={() => navigate('/iterations?create=1')}>
                      发布新版本
                    </Button>
                  </Empty>
                ) : (
                  recentBuilds.map((b) => (
                    <BuildRow key={b.id} build={b} projectName={projectName(b.projectId)} />
                  ))
                )}
              </Card>
            </Col>
            <Col xs={24} xl={10}>
              <div className="section-title">
                <span>项目</span>
                <Link to="/projects">
                  管理 <RightOutlined />
                </Link>
              </div>
              <div className="project-grid">
                {projects.map((p) => (
                  <ProjectCard key={p.id} project={p} latest={latestByProject[p.id] || {}} />
                ))}
              </div>
            </Col>
          </Row>
        </>
      )}
    </div>
  )
}

export default Dashboard
