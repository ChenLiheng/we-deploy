import React, { useEffect, useState, useCallback } from 'react'
import { Card, Button, Table, Tag, Space, Modal, Form, Input, Select, message, Popconfirm, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  SettingOutlined,
  DeleteOutlined,
  BranchesOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '@stores/projectStore'
import type { ProjectConfig, GitAuthType } from '@/types'
import dayjs from 'dayjs'
import './Projects.less'

const Projects: React.FC = () => {
  const navigate = useNavigate()
  const { projects, loading, fetchProjects, createProject, deleteProject } = useProjectStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleCreate = useCallback(async () => {
    try {
      const values = await form.validateFields()
      await createProject({
        name: values.name,
        description: values.description,
        appId: values.appId,
        repoUrl: values.repoUrl,
        branch: values.branch || 'main',
        authType: values.authType || 'token',
        environments: {
          dev: { robot: 1, setting: { es6: true, es7: true, minify: false } },
          prod: { robot: 2, setting: { es6: true, es7: true, minify: true } },
        },
      })
      message.success('项目创建成功')
      setModalOpen(false)
      form.resetFields()
    } catch {
      /* 表单校验失败 */
    }
  }, [form, createProject])

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteProject(id)
      message.success('项目已删除')
    },
    [deleteProject],
  )

  // 列宽显式声明 + 长文本 ellipsis + 操作列 fixed:
  // 配合 Table.scroll.x = 'max-content' 实现宽度自适应：
  // 容器够宽时按 width 展示，容器较窄时整体水平滚动而不挤压列
  const columns: ColumnsType<ProjectConfig> = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      // 名称列含多行描述，不启用 ellipsis（否则描述会被强制截断为单行）
      // 给定 width + cell 内 word-break 让长名称自然换行
      render: (text: string, record: ProjectConfig) => (
        <div className="project-name-cell">
          <span className="name-text">{text}</span>
          {record.description && (
            <span className="desc-text">{record.description}</span>
          )}
        </div>
      ),
    },
    {
      title: 'AppID',
      dataIndex: 'appId',
      key: 'appId',
      width: 200,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <code className="code-cell">{text}</code>
        </Tooltip>
      ),
    },
    {
      title: '仓库',
      dataIndex: 'repoUrl',
      key: 'repoUrl',
      width: 280,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <code className="code-cell repo-url">{text}</code>
        </Tooltip>
      ),
    },
    {
      title: '分支',
      dataIndex: 'branch',
      key: 'branch',
      width: 140,
      render: (text: string) => (
        <Tag className="branch-tag">
          <BranchesOutlined /> {text}
        </Tag>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (text: string) => (
        <span className="time-cell">{dayjs(text).format('YYYY-MM-DD HH:mm')}</span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, record: ProjectConfig) => (
        <Space>
          <Button
            type="text"
            icon={<SettingOutlined />}
            className="action-btn"
            onClick={() => navigate(`/projects/${record.id}/config`)}
          />
          <Popconfirm
            title="确定删除此项目？"
            description="删除后所有构建记录也会被清除"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" icon={<DeleteOutlined />} className="action-btn danger" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="projects-page">
      <div className="page-header">
        <div className="header-title">
          <span className="prompt">$</span>
          <h1>项目管理</h1>
          <span className="cursor-blink">{'\u2588'}</span>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          className="geek-button"
          onClick={() => setModalOpen(true)}
        >
          新建项目
        </Button>
      </div>

      <Card className="geek-card table-card">
        <Table
          columns={columns}
          dataSource={projects}
          rowKey="id"
          loading={loading}
          pagination={false}
          className="geek-table"
          // 按总列宽计算横向滚动阈值，窄屏滚动而非挤压
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title="新建项目"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
        }}
        okText="创建"
        cancelText="取消"
        className="geek-modal"
        width={600}
      >
        <Form form={form} layout="vertical" className="geek-form">
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="例如：商城小程序" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea placeholder="项目描述信息" rows={2} />
          </Form.Item>
          <Form.Item
            name="appId"
            label="微信 AppID"
            rules={[{ required: true, message: '请输入微信 AppID' }]}
          >
            <Input placeholder="例如：wx1234567890abcdef" />
          </Form.Item>
          <Form.Item
            name="repoUrl"
            label="Git 仓库地址"
            rules={[{ required: true, message: '请输入 Git 仓库地址' }]}
          >
            <Input placeholder="例如：https://github.com/example/repo.git" />
          </Form.Item>
          <Form.Item name="branch" label="默认分支" initialValue="main">
            <Input placeholder="main" />
          </Form.Item>
          <Form.Item name="authType" label="认证方式" initialValue="token">
            <Select
              options={[
                { label: 'Token 认证', value: 'token' as GitAuthType },
                { label: 'SSH 密钥', value: 'ssh' as GitAuthType },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Projects
