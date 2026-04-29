import React, { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Button,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  RocketOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useIterationStore } from '@stores/iterationStore'
import { useProjectStore } from '@stores/projectStore'
import type { Iteration, IterationStatus, EnvironmentType } from '@/types'
import dayjs from 'dayjs'
import BuildDrawer from './BuildDrawer'
import './Iterations.less'

const statusConfig: Record<
  IterationStatus,
  { color: string; icon: React.ReactNode; text: string }
> = {
  active: { color: '#3fb950', icon: <CheckCircleOutlined />, text: 'ACTIVE' },
  building: { color: '#58a6ff', icon: <SyncOutlined spin />, text: 'BUILDING' },
  closed: { color: '#8b949e', icon: <ClockCircleOutlined />, text: 'CLOSED' },
}

const Iterations: React.FC = () => {
  const {
    iterations,
    branches,
    loading,
    fetchingBranches,
    fetchIterations,
    createIteration,
    closeIteration,
    deleteIteration,
    triggerBuild,
    fetchBranches,
  } = useIterationStore()
  const { projects, fetchProjects } = useProjectStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [drawerBuildId, setDrawerBuildId] = useState<string | null>(null)
  const [drawerProjectId, setDrawerProjectId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    fetchIterations()
    fetchProjects()
  }, [fetchIterations, fetchProjects])

  const handleProjectChange = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId)
      form.setFieldValue('branch', undefined)
      fetchBranches(projectId)
    },
    [form, fetchBranches],
  )

  const handleCreate = useCallback(async () => {
    try {
      const values = await form.validateFields()
      await createIteration({
        projectId: values.projectId,
        name: values.name,
        description: values.description,
        branch: values.branch,
        version: values.version,
        environment: values.environment,
      })
      message.success('迭代创建成功')
      setModalOpen(false)
      form.resetFields()
      setSelectedProjectId('')
    } catch {
      /* 表单校验失败 */
    }
  }, [form, createIteration])

  const handleTriggerBuild = useCallback(
    async (iter: Iteration) => {
      try {
        const buildId = await triggerBuild(iter.id)
        setDrawerBuildId(buildId)
        setDrawerProjectId(iter.projectId)
        setDrawerOpen(true)
      } catch {
        message.error('构建触发失败')
      }
    },
    [triggerBuild],
  )

  /**
   * 关闭后再次打开抽屉，查看该迭代当前 / 最近一次构建的日志。
   * 与"触发构建"等价的入口：用 iteration.buildId 复用同一个抽屉。
   */
  const handleViewLogs = useCallback((iter: Iteration) => {
    if (!iter.buildId) return
    setDrawerBuildId(iter.buildId)
    setDrawerProjectId(iter.projectId)
    setDrawerOpen(true)
  }, [])

  const handleClose = useCallback(
    async (id: string) => {
      await closeIteration(id)
      message.success('迭代已关闭')
    },
    [closeIteration],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteIteration(id)
      message.success('迭代已删除')
    },
    [deleteIteration],
  )

  // 列宽 + ellipsis + 操作列 fixed:
  // 配合 Table.scroll.x = 'max-content' 实现宽度自适应
  const columns: ColumnsType<Iteration> = [
    {
      title: '迭代名称',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      // 名称列含多行描述，不启用 ellipsis（否则描述会被强制截断为单行）
      render: (text: string, record: Iteration) => (
        <div className="iter-name-cell">
          <RocketOutlined style={{ color: 'var(--geek-accent-purple)', marginRight: 8 }} />
          <div className="iter-name-content">
            <div className="name-text">{text}</div>
            {record.description && <div className="desc-text">{record.description}</div>}
          </div>
        </div>
      ),
    },
    {
      title: '所属项目',
      dataIndex: 'projectName',
      key: 'projectName',
      width: 160,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span className="project-text">{text}</span>
        </Tooltip>
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
      title: '环境',
      dataIndex: 'environment',
      key: 'environment',
      width: 100,
      render: (env: EnvironmentType) => (
        <Tag className={`env-tag ${env}`}>{env.toUpperCase()}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: IterationStatus) => {
        const config = statusConfig[status]
        return (
          <Tag
            className="status-tag"
            style={{ color: config.color, borderColor: config.color }}
          >
            {config.icon} {config.text}
          </Tag>
        )
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (text: string) => (
        <span className="time-cell">{dayjs(text).format('YYYY-MM-DD HH:mm')}</span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, record: Iteration) => (
        <Space>
          {record.status === 'active' && (
            <Tooltip title="触发构建">
              <Button
                type="text"
                icon={<PlayCircleOutlined />}
                className="action-btn build"
                onClick={() => handleTriggerBuild(record)}
              />
            </Tooltip>
          )}
          {/* 只要这条迭代曾经触发过构建（无论成功/失败/进行中），都允许重新打开抽屉
              查看日志：解决了之前关闭抽屉后只能去构建历史才能再看日志的问题 */}
          {record.buildId && (
            <Tooltip title="查看构建日志">
              <Button
                type="text"
                icon={<EyeOutlined />}
                className="action-btn"
                onClick={() => handleViewLogs(record)}
              />
            </Tooltip>
          )}
          {record.status === 'active' && (
            <Tooltip title="关闭迭代">
              <Button
                type="text"
                icon={<StopOutlined />}
                className="action-btn"
                onClick={() => handleClose(record.id)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title="确定删除此迭代？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button type="text" icon={<DeleteOutlined />} className="action-btn danger" />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="iterations-page">
      <div className="page-header">
        <div className="header-title">
          <span className="prompt">$</span>
          <h1>迭代管理</h1>
          <span className="cursor-blink">{'\u2588'}</span>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          className="geek-button"
          onClick={() => setModalOpen(true)}
        >
          新建迭代
        </Button>
      </div>

      <Card className="geek-card table-card">
        <Table
          columns={columns}
          dataSource={iterations}
          rowKey="id"
          loading={loading}
          pagination={false}
          className="geek-table"
          // 按列宽计算横向滚动阈值，窄屏滚动而非挤压
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title="新建迭代"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
          setSelectedProjectId('')
        }}
        okText="创建"
        cancelText="取消"
        className="geek-modal"
        width={600}
      >
        <Form form={form} layout="vertical" className="geek-form">
          <Form.Item
            name="projectId"
            label="所属项目"
            rules={[{ required: true, message: '请选择项目' }]}
          >
            <Select
              placeholder="请选择项目"
              onChange={handleProjectChange}
              options={projects.map((p) => ({ label: p.name, value: p.id }))}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="迭代名称"
            rules={[{ required: true, message: '请输入迭代名称' }]}
          >
            <Input placeholder="例如：v1.0.0 首页重构" />
          </Form.Item>
          <Form.Item name="description" label="迭代描述">
            <Input.TextArea placeholder="描述本次迭代的主要内容" rows={2} />
          </Form.Item>
          <Form.Item
            name="branch"
            label="分支"
            rules={[{ required: true, message: '请选择分支' }]}
          >
            <Select
              placeholder={selectedProjectId ? '请选择分支' : '请先选择项目'}
              loading={fetchingBranches}
              disabled={!selectedProjectId}
              options={branches.map((b) => ({ label: b, value: b }))}
            />
          </Form.Item>
          <Form.Item
            name="version"
            label="版本号"
            rules={[{ required: true, message: '请输入版本号' }]}
          >
            <Input placeholder="例如：1.0.0" />
          </Form.Item>
          <Form.Item
            name="environment"
            label="目标环境"
            rules={[{ required: true, message: '请选择环境' }]}
          >
            <Select
              placeholder="请选择环境"
              options={[
                { label: 'DEV (开发环境)', value: 'dev' as EnvironmentType },
                { label: 'PROD (生产环境)', value: 'prod' as EnvironmentType },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <BuildDrawer
        buildId={drawerBuildId}
        projectId={drawerProjectId || undefined}
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  )
}

export default Iterations
