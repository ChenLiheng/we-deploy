import React, { useEffect } from 'react'
import { Row, Col, Card, Statistic, Button, Tag, Space } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  SettingOutlined,
  CloudUploadOutlined,
  GithubOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '@stores/projectStore'
import type { BuildRecord, BuildStatus } from '@/types'
import './Dashboard.less'

// 必须覆盖 BuildStatus 全部 7 种取值（pending/cloning/installing/building/uploading/success/failed），
// 用 Record<BuildStatus, ...> 让 TS 在以后新增状态时编译期就强制提示，
// 避免之前 `statusConfig[build.status]` 拿到 undefined → `.color` 崩溃整个 Dashboard 的问题。
// 颜色 / 图标与 BuildHistory 页面保持一致，确保两个页面状态展示统一。
const statusConfig: Record<BuildStatus, { color: string; icon: React.ReactNode; text: string }> = {
  pending: { color: '#8b949e', icon: <ClockCircleOutlined />, text: 'PENDING' },
  cloning: { color: '#58a6ff', icon: <SyncOutlined spin />, text: 'CLONING' },
  installing: { color: '#58a6ff', icon: <SyncOutlined spin />, text: 'INSTALLING' },
  building: { color: '#58a6ff', icon: <SyncOutlined spin />, text: 'BUILDING' },
  uploading: { color: '#bc8cff', icon: <SyncOutlined spin />, text: 'UPLOADING' },
  success: { color: '#3fb950', icon: <CheckCircleOutlined />, text: 'SUCCESS' },
  failed: { color: '#ff7b72', icon: <CloseCircleOutlined />, text: 'FAILED' },
}

// fallback 配置：当后端返回未知/脏状态值时使用，保证 UI 不再因取不到配置崩溃
const fallbackStatusConfig = {
  color: '#8b949e',
  icon: <ClockCircleOutlined />,
  text: 'UNKNOWN',
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { projects, builds, fetchProjects, fetchBuilds } = useProjectStore()

  useEffect(() => {
    fetchProjects()
    fetchBuilds()
  }, [fetchProjects, fetchBuilds])

  const getLatestBuild = (projectId: string, env: 'dev' | 'prod') => {
    return builds
      .filter((b) => b.projectId === projectId && b.environment === env)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0]
  }

  const getBuildStatusTag = (build?: BuildRecord) => {
    if (!build) return <Tag className="geek-tag">NO BUILD</Tag>
    // 兜底：当 build.status 落在 statusConfig 之外（如后端临时新增状态、脏数据）
    // 时使用 fallbackStatusConfig，避免直接访问 undefined.color 引发整页崩溃
    const config = statusConfig[build.status as BuildStatus] ?? fallbackStatusConfig
    return (
      <Tag className="geek-tag" style={{ color: config.color, borderColor: config.color }}>
        {config.icon}
        <span className="tag-text">{config.text}</span>
      </Tag>
    )
  }

  const handleBuild = (projectId: string, env: 'dev' | 'prod') => {
    console.log(`Trigger build: ${projectId}, ${env}`)
  }

  const totalBuilds = builds.length
  const successBuilds = builds.filter((b) => b.status === 'success').length
  const failedBuilds = builds.filter((b) => b.status === 'failed').length
  const successRate = totalBuilds > 0 ? Math.round((successBuilds / totalBuilds) * 100) : 0

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="header-title">
          <span className="prompt">$</span>
          <h1>系统概览</h1>
          <span className="cursor-blink">{'\u2588'}</span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" className="geek-button">
          新建项目
        </Button>
      </div>

      <Row gutter={[16, 16]} className="stats-row">
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card geek-card">
            <div className="stat-header">
              <CloudUploadOutlined className="stat-icon" style={{ color: '#3fb950' }} />
              <span className="stat-label">PROJECTS</span>
            </div>
            <Statistic
              value={projects.length}
              valueStyle={{
                color: '#3fb950',
                fontFamily: 'var(--geek-font-mono)',
                fontSize: '32px',
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card geek-card">
            <div className="stat-header">
              <CloudUploadOutlined className="stat-icon" style={{ color: '#58a6ff' }} />
              <span className="stat-label">BUILDS</span>
            </div>
            <Statistic
              value={totalBuilds}
              valueStyle={{
                color: '#58a6ff',
                fontFamily: 'var(--geek-font-mono)',
                fontSize: '32px',
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card geek-card">
            <div className="stat-header">
              <CheckCircleOutlined className="stat-icon" style={{ color: '#3fb950' }} />
              <span className="stat-label">SUCCESS RATE</span>
            </div>
            <Statistic
              value={successRate}
              suffix="%"
              valueStyle={{
                color: successRate > 80 ? '#3fb950' : '#ff7b72',
                fontFamily: 'var(--geek-font-mono)',
                fontSize: '32px',
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card geek-card">
            <div className="stat-header">
              <CloseCircleOutlined className="stat-icon" style={{ color: '#ff7b72' }} />
              <span className="stat-label">FAILED</span>
            </div>
            <Statistic
              value={failedBuilds}
              valueStyle={{
                color: failedBuilds > 0 ? '#ff7b72' : '#3fb950',
                fontFamily: 'var(--geek-font-mono)',
                fontSize: '32px',
              }}
            />
          </Card>
        </Col>
      </Row>

      <div className="section-header">
        <span className="comment">{'// 项目列表'}</span>
        <h2>已配置项目</h2>
      </div>

      <Row gutter={[16, 16]}>
        {projects.map((project) => {
          const devBuild = getLatestBuild(project.id, 'dev')
          const prodBuild = getLatestBuild(project.id, 'prod')
          return (
            <Col xs={24} lg={12} key={project.id}>
              <Card
                className="project-card geek-card"
                title={
                  <div className="project-card-header">
                    <GithubOutlined style={{ color: '#58a6ff' }} />
                    <span className="project-name">{project.name}</span>
                  </div>
                }
                extra={
                  <Button
                    type="text"
                    icon={<SettingOutlined />}
                    className="icon-button"
                    onClick={() => navigate(`/projects/${project.id}/config`)}
                  />
                }
              >
                <p className="project-desc">{project.description}</p>
                <div className="project-info">
                  <div className="info-line">
                    <span className="comment">{'// AppID'}</span>
                    <code className="code-text">{project.appId}</code>
                  </div>
                  <div className="info-line">
                    <span className="comment">{'// Repository'}</span>
                    <code className="code-text">{project.repoUrl}</code>
                  </div>
                </div>
                <div className="build-status">
                  <div className="env-build dev-env">
                    <div className="env-header">
                      <Tag className="env-tag dev">DEV</Tag>
                      <code className="env-version">{devBuild?.version || 'null'}</code>
                    </div>
                    {getBuildStatusTag(devBuild)}
                    <Space className="env-actions">
                      <Button
                        size="small"
                        className="geek-button-small"
                        onClick={() => handleBuild(project.id, 'dev')}
                      >
                        build
                      </Button>
                    </Space>
                  </div>
                  <div className="env-build prod-env">
                    <div className="env-header">
                      <Tag className="env-tag prod">PROD</Tag>
                      <code className="env-version">{prodBuild?.version || 'null'}</code>
                    </div>
                    {getBuildStatusTag(prodBuild)}
                    <Space className="env-actions">
                      <Button
                        size="small"
                        className="geek-button-small"
                        onClick={() => handleBuild(project.id, 'prod')}
                      >
                        build
                      </Button>
                    </Space>
                  </div>
                </div>
              </Card>
            </Col>
          )
        })}
      </Row>
    </div>
  )
}

export default Dashboard
