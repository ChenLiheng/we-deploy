import React, { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Button,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Radio,
  Tooltip,
  App,
  Dropdown,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  SettingOutlined,
  DeleteOutlined,
  BranchesOutlined,
  RocketOutlined,
  SearchOutlined,
  MoreOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
} from '@ant-design/icons'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useProjectStore } from '@stores/projectStore'
import { getErrorMessage } from '@services/serverApi'
import PageHeader from '@components/common/PageHeader'
import { fromNow } from '@/constants/status'
import type { ProjectConfig, GitAuthType } from '@/types'

const APPID_PATTERN = /^wx[0-9a-f]{16}$/i

function configIssues(p: ProjectConfig): string[] {
  const issues: string[] = []
  if (!p.hasPrivateKey) issues.push('未配置上传密钥')
  if (p.authType === 'ssh' && !p.sshKeyPath) issues.push('未配置 SSH 私钥路径')
  return issues
}

const CreateProjectModal: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const createProject = useProjectStore((s) => s.createProject)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const authType = Form.useWatch('authType', form) as GitAuthType | undefined

  const handleOk = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const project = await createProject({
        name: values.name.trim(),
        description: values.description,
        appId: values.appId.trim(),
        repoUrl: values.repoUrl.trim(),
        branch: values.branch?.trim() || 'main',
        authType: values.authType,
        authToken: values.authType === 'token' ? values.authToken : undefined,
        sshKeyPath: values.authType === 'ssh' ? values.sshKeyPath : undefined,
        environments: {
          dev: { robot: 1, setting: { es6: true, es7: true, minify: false } },
          prod: { robot: 2, setting: { es6: true, es7: true, minify: true } },
        },
      })
      message.success('项目已创建，请继续配置上传密钥')
      form.resetFields()
      onClose()
      navigate(`/projects/${project.id}/config?tab=ci`)
    } catch (err) {
      message.error(getErrorMessage(err, '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="新建项目"
      open={open}
      onOk={handleOk}
      confirmLoading={saving}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      okText="创建并继续配置"
      cancelText="取消"
      width={560}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ branch: 'main', authType: 'token' }}>
        <Form.Item
          name="name"
          label="项目名称"
          rules={[{ required: true, whitespace: true, message: '请输入项目名称' }]}
        >
          <Input placeholder="例如：商城小程序" maxLength={50} />
        </Form.Item>
        <Form.Item
          name="appId"
          label="小程序 AppID"
          tooltip="微信公众平台 → 开发管理 → 开发设置"
          rules={[
            { required: true, message: '请输入 AppID' },
            { pattern: APPID_PATTERN, message: 'AppID 格式应为 wx 开头的 18 位字符' },
          ]}
        >
          <Input placeholder="wx1234567890abcdef" className="mono" />
        </Form.Item>
        <Form.Item
          name="repoUrl"
          label="Git 仓库地址"
          rules={[{ required: true, whitespace: true, message: '请输入仓库地址' }]}
        >
          <Input
            placeholder="https://github.com/org/repo.git 或 git@github.com:org/repo.git"
            className="mono"
          />
        </Form.Item>
        <Form.Item name="branch" label="默认分支" extra="新建迭代时可另选分支">
          <Input placeholder="main" prefix={<BranchesOutlined />} />
        </Form.Item>
        <Form.Item name="authType" label="仓库认证方式">
          <Radio.Group
            optionType="button"
            options={[
              { label: 'HTTPS + Token', value: 'token' },
              { label: 'SSH 密钥', value: 'ssh' },
            ]}
          />
        </Form.Item>
        {authType === 'ssh' ? (
          <Form.Item
            name="sshKeyPath"
            label="服务器上的 SSH 私钥路径"
            extra="私钥文件需对后端进程可读"
          >
            <Input placeholder="/root/.ssh/id_rsa" className="mono" />
          </Form.Item>
        ) : (
          <Form.Item
            name="authToken"
            label="Access Token"
            extra="公开仓库可留空；Token 加密存储，保存后不再返回前端"
          >
            <Input.Password placeholder="ghp_xxx / glpat-xxx" autoComplete="new-password" />
          </Form.Item>
        )}
        <Form.Item name="description" label="描述">
          <Input.TextArea placeholder="可选" rows={2} maxLength={200} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

const Projects: React.FC = () => {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const [params, setParams] = useSearchParams()
  const { projects, loading, fetchProjects, deleteProject } = useProjectStore()
  const [keyword, setKeyword] = useState('')
  const createOpen = params.get('create') === '1'

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const setCreateOpen = (open: boolean) => {
    const next = new URLSearchParams(params)
    if (open) next.set('create', '1')
    else next.delete('create')
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return projects
    return projects.filter((p) =>
      [p.name, p.appId, p.repoUrl, p.description].some((v) => v?.toLowerCase().includes(kw)),
    )
  }, [projects, keyword])

  const confirmDelete = (project: ProjectConfig) => {
    modal.confirm({
      title: `删除项目「${project.name}」？`,
      icon: <ExclamationCircleFilled />,
      content: '该项目下的所有迭代、构建记录和日志都会被永久删除，此操作不可恢复。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteProject(project.id)
          message.success('项目已删除')
        } catch (err) {
          message.error(getErrorMessage(err, '删除失败'))
        }
      },
    })
  }

  const columns: ColumnsType<ProjectConfig> = [
    {
      title: '项目',
      dataIndex: 'name',
      width: 220,
      render: (_, p) => (
        <div className="cell-primary">
          <Link to={`/projects/${p.id}/config`} className="cell-primary__title">
            {p.name}
          </Link>
          {p.description && <div className="cell-primary__sub">{p.description}</div>}
        </div>
      ),
    },
    {
      title: 'AppID',
      dataIndex: 'appId',
      width: 180,
      render: (v: string) => <code className="mono">{v}</code>,
    },
    {
      title: '仓库',
      dataIndex: 'repoUrl',
      width: 260,
      ellipsis: { showTitle: false },
      render: (v: string, p) => (
        <Tooltip title={v} placement="topLeft">
          <div className="cell-primary">
            <code className="mono cell-ellipsis">{v.replace(/^https?:\/\//, '')}</code>
            <div className="cell-primary__sub">
              <BranchesOutlined /> {p.branch} · {p.authType === 'ssh' ? 'SSH' : 'Token'}
            </div>
          </div>
        </Tooltip>
      ),
    },
    {
      title: '配置状态',
      key: 'config',
      width: 150,
      render: (_, p) => {
        const issues = configIssues(p)
        return issues.length === 0 ? (
          <Tag color="success" variant="filled" icon={<CheckCircleFilled />}>
            可构建
          </Tag>
        ) : (
          <Tooltip title={issues.join('；')}>
            <Link to={`/projects/${p.id}/config?tab=ci`}>
              <Tag color="warning" variant="filled" icon={<ExclamationCircleFilled />}>
                {issues[0]}
              </Tag>
            </Link>
          </Tooltip>
        )
      },
    },
    {
      title: '更新于',
      dataIndex: 'updatedAt',
      width: 100,
      render: (v: string) => <span className="muted">{fromNow(v)}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, p) => (
        <Space size={4}>
          <Button
            size="small"
            type="link"
            icon={<RocketOutlined />}
            onClick={() => navigate(`/iterations?create=1&projectId=${p.id}`)}
          >
            发布
          </Button>
          <Button
            size="small"
            type="link"
            icon={<SettingOutlined />}
            onClick={() => navigate(`/projects/${p.id}/config`)}
          >
            配置
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'builds',
                  label: '构建记录',
                  onClick: () => navigate(`/builds?projectId=${p.id}`),
                },
                { type: 'divider' },
                {
                  key: 'delete',
                  label: '删除项目',
                  danger: true,
                  icon: <DeleteOutlined />,
                  onClick: () => confirmDelete(p),
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
        title="项目"
        description="每个项目对应一个小程序 AppID 与一个 Git 仓库。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建项目
          </Button>
        }
      />

      <Card variant="borderless" className="table-card">
        <div className="table-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索名称 / AppID / 仓库"
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
            emptyText: keyword ? (
              '没有匹配的项目'
            ) : (
              <div className="table-empty">
                <p>还没有项目</p>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  新建项目
                </Button>
              </div>
            ),
          }}
        />
      </Card>

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

export default Projects
