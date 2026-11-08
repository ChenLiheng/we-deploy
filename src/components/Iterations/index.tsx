import React, { useEffect, useMemo, useState } from 'react'
import { Card, Button, Table, Space, Input, Select, Segmented, Tooltip, Dropdown, App } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  PlayCircleOutlined,
  FileTextOutlined,
  MoreOutlined,
  SearchOutlined,
  BranchesOutlined,
  QrcodeOutlined,
  StopOutlined,
  UndoOutlined,
  DeleteOutlined,
  ExclamationCircleFilled,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useIterationStore } from '@stores/iterationStore'
import { useProjectStore } from '@stores/projectStore'
import api, { getErrorMessage } from '@services/serverApi'
import PageHeader from '@components/common/PageHeader'
import { BuildStatusTag, EnvTag, IterationStatusTag } from '@components/common/StatusTag'
import { fromNow } from '@/constants/status'
import type { Iteration, BuildRecord } from '@/types'
import BuildDrawer from './BuildDrawer'
import CreateIterationModal from './CreateIterationModal'

type StatusFilter = 'open' | 'all' | 'closed'

const Iterations: React.FC = () => {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const [params, setParams] = useSearchParams()
  const {
    iterations,
    loading,
    fetchIterations,
    closeIteration,
    reopenIteration,
    deleteIteration,
    triggerBuild,
  } = useIterationStore()
  const { projects, fetchProjects } = useProjectStore()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [keyword, setKeyword] = useState('')
  const [drawer, setDrawer] = useState<{
    buildId: string
    projectId: string
    title: string
  } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const projectFilter = params.get('projectId') || undefined
  const createOpen = params.get('create') === '1'

  useEffect(() => {
    fetchIterations()
    fetchProjects()
  }, [fetchIterations, fetchProjects])

  const hasBuilding = iterations.some((i) => i.status === 'building')
  useEffect(() => {
    if (!hasBuilding) return
    const timer = setInterval(() => fetchIterations({ silent: true }), 4000)
    return () => clearInterval(timer)
  }, [hasBuilding, fetchIterations])

  const updateParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return iterations.filter((i) => {
      if (projectFilter && i.projectId !== projectFilter) return false
      if (statusFilter === 'open' && i.status === 'closed') return false
      if (statusFilter === 'closed' && i.status !== 'closed') return false
      if (
        kw &&
        ![i.name, i.version, i.branch, i.description].some((v) => v?.toLowerCase().includes(kw))
      )
        return false
      return true
    })
  }, [iterations, projectFilter, statusFilter, keyword])

  const openDrawer = (iter: Iteration, buildId = iter.buildId) => {
    if (!buildId) return
    setDrawer({
      buildId,
      projectId: iter.projectId,
      title: `${iter.projectName} · v${iter.version}`,
    })
  }

  const runBuild = async (iter: Iteration) => {
    setBusyId(iter.id)
    try {
      const build = await triggerBuild(iter.id)
      message.success('已加入构建队列')
      openDrawer(iter, build.id)
    } catch (err) {
      message.error(getErrorMessage(err, '构建触发失败'))
    } finally {
      setBusyId(null)
    }
  }

  const handleBuild = (iter: Iteration) => {
    if (iter.environment !== 'prod') {
      runBuild(iter)
      return
    }
    modal.confirm({
      title: `构建并上传正式版 v${iter.version}？`,
      icon: <ExclamationCircleFilled />,
      content: `将使用分支 ${iter.branch} 构建，并以 PROD 机器人上传到「${iter.projectName}」。上传后仍需在微信后台提交审核才会发布。`,
      okText: '开始构建',
      cancelText: '取消',
      onOk: () => runBuild(iter),
    })
  }

  const handlePreview = async (iter: Iteration) => {
    if (!iter.buildId) return
    try {
      const { data } = await api.post<BuildRecord>(`/builds/${iter.buildId}/preview`, {})
      message.success('预览构建已加入队列，完成后可在构建页查看二维码')
      openDrawer(iter, data.id)
    } catch (err) {
      message.error(getErrorMessage(err, '预览触发失败'))
    }
  }

  const withFeedback = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn()
      message.success(ok)
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const confirmDelete = (iter: Iteration) =>
    modal.confirm({
      title: `删除迭代「${iter.name}」？`,
      content: '迭代删除后不可恢复，已有的构建记录会保留。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => withFeedback(() => deleteIteration(iter.id), '迭代已删除'),
    })

  const columns: ColumnsType<Iteration> = [
    {
      title: '迭代',
      dataIndex: 'name',
      width: 240,
      render: (_, it) => (
        <div className="cell-primary">
          <span className="cell-primary__title">{it.name}</span>
          <div className="cell-primary__sub">
            {it.projectName}
            {it.description ? ` · ${it.description}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 150,
      render: (v: string, it) => (
        <Space size={6}>
          <code className="mono">v{v}</code>
          <EnvTag env={it.environment} short />
        </Space>
      ),
    },
    {
      title: '分支',
      dataIndex: 'branch',
      width: 170,
      ellipsis: { showTitle: false },
      render: (v: string) => (
        <Tooltip title={v} placement="topLeft">
          <span className="mono cell-ellipsis">
            <BranchesOutlined /> {v}
          </span>
        </Tooltip>
      ),
    },
    {
      title: '最近构建',
      key: 'lastBuild',
      width: 170,
      render: (_, it) =>
        it.buildId ? (
          <button type="button" className="link-button" onClick={() => openDrawer(it)}>
            <BuildStatusTag status={it.lastBuildStatus} />
            <span className="muted">{fromNow(it.lastBuildStart)}</span>
          </button>
        ) : (
          <span className="muted">未构建</span>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => <IterationStatusTag status={s} />,
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      fixed: 'right',
      render: (_, it) => (
        <Space size={4}>
          {it.status === 'building' ? (
            <Button size="small" icon={<FileTextOutlined />} onClick={() => openDrawer(it)}>
              查看进度
            </Button>
          ) : it.status === 'active' ? (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<PlayCircleOutlined />}
              loading={busyId === it.id}
              onClick={() => handleBuild(it)}
            >
              {it.buildId ? '重新构建' : '构建'}
            </Button>
          ) : (
            <Button
              size="small"
              icon={<UndoOutlined />}
              onClick={() => withFeedback(() => reopenIteration(it.id), '迭代已重新打开')}
            >
              重新打开
            </Button>
          )}
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'logs',
                  icon: <FileTextOutlined />,
                  label: '构建日志',
                  disabled: !it.buildId,
                  onClick: () => openDrawer(it),
                },
                {
                  key: 'preview',
                  icon: <QrcodeOutlined />,
                  label: '生成预览二维码',
                  disabled: !it.buildId || it.status === 'building',
                  onClick: () => handlePreview(it),
                },
                {
                  key: 'history',
                  label: '该项目构建记录',
                  onClick: () => navigate(`/builds?projectId=${it.projectId}`),
                },
                { type: 'divider' },
                it.status === 'closed'
                  ? {
                      key: 'reopen',
                      icon: <UndoOutlined />,
                      label: '重新打开',
                      onClick: () => withFeedback(() => reopenIteration(it.id), '迭代已重新打开'),
                    }
                  : {
                      key: 'close',
                      icon: <StopOutlined />,
                      label: '关闭迭代',
                      disabled: it.status === 'building',
                      onClick: () => withFeedback(() => closeIteration(it.id), '迭代已关闭'),
                    },
                {
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: '删除',
                  danger: true,
                  disabled: it.status === 'building',
                  onClick: () => confirmDelete(it),
                },
              ],
            }}
          >
            <Button size="small" type="text" icon={<MoreOutlined />} aria-label="更多操作" />
          </Dropdown>
        </Space>
      ),
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="迭代发布"
        description="每个迭代锁定一个分支、版本号和目标环境，可反复构建直到满意后关闭。"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => updateParams({ create: '1' })}
            disabled={projects.length === 0}
          >
            发布新版本
          </Button>
        }
      />

      <Card variant="borderless" className="table-card">
        <div className="table-toolbar">
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              { label: '进行中', value: 'open' },
              { label: '已关闭', value: 'closed' },
              { label: '全部', value: 'all' },
            ]}
          />
          <Select
            allowClear
            placeholder="全部项目"
            value={projectFilter}
            onChange={(v) => updateParams({ projectId: v })}
            options={projects.map((p) => ({ label: p.name, value: p.id }))}
            className="table-toolbar__select"
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索名称 / 版本 / 分支"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="table-toolbar__search"
          />
        </div>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          pagination={filtered.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText:
              projects.length === 0 ? (
                <div className="table-empty">
                  <p>先创建一个项目，才能发布版本</p>
                  <Button type="primary" onClick={() => navigate('/projects?create=1')}>
                    新建项目
                  </Button>
                </div>
              ) : iterations.length === 0 ? (
                <div className="table-empty">
                  <p>还没有迭代</p>
                  <Button type="primary" onClick={() => updateParams({ create: '1' })}>
                    发布新版本
                  </Button>
                </div>
              ) : (
                '没有符合条件的迭代'
              ),
          }}
        />
      </Card>

      <CreateIterationModal
        open={createOpen}
        defaultProjectId={projectFilter}
        onClose={() => updateParams({ create: undefined })}
        onCreated={(iter, buildNow) => {
          updateParams({ create: undefined })
          setStatusFilter('open')
          if (buildNow) runBuild(iter)
          else message.success('迭代已创建')
        }}
      />

      <BuildDrawer
        open={!!drawer}
        buildId={drawer?.buildId || null}
        projectId={drawer?.projectId}
        title={drawer?.title}
        onClose={() => {
          setDrawer(null)
          fetchIterations({ silent: true })
        }}
      />
    </div>
  )
}

export default Iterations
