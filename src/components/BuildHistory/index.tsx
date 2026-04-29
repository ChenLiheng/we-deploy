import React, { useEffect } from 'react'
import { Card, Table, Tag, Button, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '@stores/projectStore'
import type { BuildRecord, BuildStatus, EnvironmentType } from '@/types'
import dayjs from 'dayjs'
import './BuildHistory.less'

const statusConfig: Record<BuildStatus, { color: string; icon: React.ReactNode; text: string }> = {
  pending: { color: '#8b949e', icon: <ClockCircleOutlined />, text: 'PENDING' },
  queued: { color: '#d29922', icon: <ClockCircleOutlined />, text: 'QUEUED' },
  cloning: { color: '#58a6ff', icon: <SyncOutlined spin />, text: 'CLONING' },
  installing: { color: '#58a6ff', icon: <SyncOutlined spin />, text: 'INSTALLING' },
  building: { color: '#58a6ff', icon: <SyncOutlined spin />, text: 'BUILDING' },
  uploading: { color: '#bc8cff', icon: <SyncOutlined spin />, text: 'UPLOADING' },
  success: { color: '#3fb950', icon: <CheckCircleOutlined />, text: 'SUCCESS' },
  failed: { color: '#ff7b72', icon: <CloseCircleOutlined />, text: 'FAILED' },
}

const BuildHistory: React.FC = () => {
  const navigate = useNavigate()
  const { builds, projects, loading, fetchBuilds, fetchProjects } = useProjectStore()

  useEffect(() => {
    fetchBuilds()
    fetchProjects()
  }, [fetchBuilds, fetchProjects])

  const getProjectName = (projectId: string) => {
    return projects.find((p) => p.id === projectId)?.name || '未知项目'
  }

  // 显式声明每列宽度并对长文本启用 ellipsis：
  // 1) 容器够宽时按 width 比例铺满，不会出现挤压
  // 2) 容器变窄时配合 Table.scroll.x = 'max-content' 触发整表水平滚动，
  //    保证内容完整可读，不再被压成多行或者被截断变形
  // 3) 操作列 fixed: 'right' 保证在水平滚动时仍可访问
  const columns: ColumnsType<BuildRecord> = [
    {
      title: '构建 ID',
      dataIndex: 'id',
      key: 'id',
      width: 220,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <code className="code-cell">{text}</code>
        </Tooltip>
      ),
    },
    {
      title: '项目',
      dataIndex: 'projectId',
      key: 'projectId',
      width: 160,
      ellipsis: { showTitle: false },
      render: (projectId: string) => {
        const name = getProjectName(projectId)
        return (
          <Tooltip title={name} placement="topLeft">
            <span className="project-text">{name}</span>
          </Tooltip>
        )
      },
    },
    {
      title: '环境',
      dataIndex: 'environment',
      key: 'environment',
      width: 100,
      render: (env: EnvironmentType) => (
        <Tag className={`env-tag ${env}`}>{env.toUpperCase()}</Tag>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 110,
      render: (text: string) => <code className="code-cell">{text}</code>,
    },
    {
      title: '分支',
      dataIndex: 'branch',
      key: 'branch',
      width: 160,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <code className="code-cell branch">{text}</code>
        </Tooltip>
      ),
    },
    {
      title: 'Commit',
      dataIndex: 'commitHash',
      key: 'commitHash',
      width: 140,
      ellipsis: { showTitle: false },
      render: (text: string) =>
        text ? (
          <Tooltip title={text} placement="topLeft">
            <code className="code-cell commit">{text.slice(0, 7)}</code>
          </Tooltip>
        ) : (
          '-'
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: BuildStatus) => {
        const config = statusConfig[status]
        return (
          <Tag className="status-tag" style={{ color: config.color, borderColor: config.color }}>
            {config.icon} {config.text}
          </Tag>
        )
      },
    },
    {
      title: '触发者',
      dataIndex: 'triggerBy',
      key: 'triggerBy',
      width: 120,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span className="user-cell">{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 160,
      render: (text: string) => (
        <span className="time-cell">{dayjs(text).format('MM-DD HH:mm:ss')}</span>
      ),
    },
    {
      title: '耗时',
      key: 'duration',
      width: 100,
      render: (_: unknown, record: BuildRecord) => {
        if (!record.endTime) return <span className="time-cell">-</span>
        const start = dayjs(record.startTime)
        const end = dayjs(record.endTime)
        const diff = end.diff(start, 'second')
        const min = Math.floor(diff / 60)
        const sec = diff % 60
        return (
          <span className="time-cell">
            {min > 0 ? `${min}m ` : ''}
            {sec}s
          </span>
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, record: BuildRecord) => (
        <Tooltip title="查看日志">
          <Button
            type="text"
            icon={<EyeOutlined />}
            className="action-btn"
            onClick={() => navigate(`/projects/${record.projectId}/builds/${record.id}`)}
          />
        </Tooltip>
      ),
    },
  ]

  return (
    <div className="build-history-page">
      <div className="page-header">
        <div className="header-title">
          <span className="prompt">$</span>
          <h1>构建历史</h1>
          <span className="cursor-blink">{'█'}</span>
        </div>
        <div className="header-stats">
          <span className="stat-item">
            <CheckCircleOutlined style={{ color: '#3fb950' }} />
            {builds.filter((b) => b.status === 'success').length} 成功
          </span>
          <span className="stat-item">
            <CloseCircleOutlined style={{ color: '#ff7b72' }} />
            {builds.filter((b) => b.status === 'failed').length} 失败
          </span>
        </div>
      </div>

      <Card className="geek-card table-card">
        <Table
          columns={columns}
          dataSource={builds}
          rowKey="id"
          loading={loading}
          pagination={false}
          className="geek-table"
          // 总宽度超出容器时启用整表水平滚动，避免列被挤压变形；
          // 'max-content' 让总宽度等于所有列 width 之和，宽屏时刚好铺满，窄屏时滚动
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </div>
  )
}

export default BuildHistory
