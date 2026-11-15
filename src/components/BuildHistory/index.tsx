import React, { useEffect, useMemo, useState } from 'react'
import { Card, Table, Button, Select, Segmented, Space, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, BranchesOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useProjectStore } from '@stores/projectStore'
import PageHeader from '@components/common/PageHeader'
import { BuildStatusTag, EnvTag, PreviewTag } from '@components/common/StatusTag'
import { formatDuration, formatTime, isRunning } from '@/constants/status'
import type { BuildRecord } from '@/types'

type StatusFilter = 'all' | 'running' | 'success' | 'failed'

const BuildHistory: React.FC = () => {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { builds, projects, buildsLoading, fetchBuilds, fetchProjects } = useProjectStore()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [env, setEnv] = useState<string>()

  const projectFilter = params.get('projectId') || undefined

  useEffect(() => {
    fetchBuilds()
    fetchProjects()
  }, [fetchBuilds, fetchProjects])

  const hasRunning = builds.some((b) => isRunning(b.status))
  useEffect(() => {
    if (!hasRunning) return
    const timer = setInterval(() => fetchBuilds({ silent: true }), 5000)
    return () => clearInterval(timer)
  }, [hasRunning, fetchBuilds])

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]))
    return (id: string) => map.get(id) || '已删除项目'
  }, [projects])

  const filtered = useMemo(
    () =>
      builds.filter((b) => {
        if (projectFilter && b.projectId !== projectFilter) return false
        if (env && b.environment !== env) return false
        if (status === 'running' && !isRunning(b.status)) return false
        if ((status === 'success' || status === 'failed') && b.status !== status) return false
        return true
      }),
    [builds, projectFilter, env, status],
  )

  const summary = useMemo(() => {
    const done = filtered.filter((b) => !isRunning(b.status))
    const ok = done.filter((b) => b.status === 'success').length
    return { total: filtered.length, ok, failed: done.length - ok }
  }, [filtered])

  const columns: ColumnsType<BuildRecord> = [
    {
      title: '版本',
      key: 'version',
      width: 200,
      render: (_, b) => (
        <div className="cell-primary">
          <Space size={6}>
            <code className="mono cell-primary__title">v{b.version}</code>
            <EnvTag env={b.environment} short />
            {b.kind === 'preview' && <PreviewTag />}
          </Space>
          <div className="cell-primary__sub mono">{b.id}</div>
        </div>
      ),
    },
    {
      title: '项目',
      dataIndex: 'projectId',
      width: 150,
      ellipsis: true,
      render: (id: string) => projectName(id),
    },
    {
      title: '分支',
      dataIndex: 'branch',
      width: 180,
      ellipsis: { showTitle: false },
      render: (v: string, b) => (
        <Tooltip title={v} placement="topLeft">
          <div className="cell-primary">
            <span className="mono cell-ellipsis">
              <BranchesOutlined /> {v || '-'}
            </span>
            {b.commitHash && (
              <div className="cell-primary__sub mono">{b.commitHash.slice(0, 7)}</div>
            )}
          </div>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (s: string, b) =>
        b.error ? (
          <Tooltip title={b.error}>
            <span>
              <BuildStatusTag status={s} />
            </span>
          </Tooltip>
        ) : (
          <BuildStatusTag status={s} />
        ),
    },
    {
      title: '触发人',
      dataIndex: 'triggerBy',
      width: 100,
      render: (v: string) => v || <span className="muted">系统</span>,
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      width: 130,
      render: (v: string) => <span className="muted">{formatTime(v)}</span>,
    },
    {
      title: '耗时',
      key: 'duration',
      width: 100,
      render: (_, b) => (
        <span className={isRunning(b.status) ? 'text-info' : 'muted'}>
          {isRunning(b.status) ? '进行中' : formatDuration(b.startTime, b.endTime)}
        </span>
      ),
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="构建记录"
        description={
          <span>
            共 {summary.total} 条 · <span className="text-success">{summary.ok} 成功</span> ·{' '}
            <span className="text-danger">{summary.failed} 失败</span>
          </span>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => fetchBuilds()} loading={buildsLoading}>
            刷新
          </Button>
        }
      />

      <Card variant="borderless" className="table-card">
        <div className="table-toolbar">
          <Segmented
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
            options={[
              { label: '全部', value: 'all' },
              { label: '进行中', value: 'running' },
              { label: '成功', value: 'success' },
              { label: '失败', value: 'failed' },
            ]}
          />
          <Select
            allowClear
            placeholder="全部项目"
            value={projectFilter}
            onChange={(v) => {
              const next = new URLSearchParams(params)
              if (v) next.set('projectId', v)
              else next.delete('projectId')
              setParams(next, { replace: true })
            }}
            options={projects.map((p) => ({ label: p.name, value: p.id }))}
            className="table-toolbar__select"
          />
          <Select
            allowClear
            placeholder="全部环境"
            value={env}
            onChange={setEnv}
            options={[
              { label: '开发版', value: 'dev' },
              { label: '正式版', value: 'prod' },
            ]}
            className="table-toolbar__select table-toolbar__select--sm"
          />
        </div>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={buildsLoading}
          pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
          rowClassName="clickable-row"
          onRow={(b) => ({ onClick: () => navigate(`/projects/${b.projectId}/builds/${b.id}`) })}
          locale={{ emptyText: builds.length ? '没有符合条件的构建' : '还没有构建记录' }}
        />
      </Card>
    </div>
  )
}

export default BuildHistory
