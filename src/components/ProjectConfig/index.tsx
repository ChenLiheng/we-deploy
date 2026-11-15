import React, { useEffect, useRef, useState } from 'react'
import {
  Card,
  Form,
  Input,
  Select,
  Switch,
  Button,
  Tabs,
  Spin,
  Radio,
  Alert,
  Row,
  Col,
  Result,
  Space,
  App,
  Tag,
} from 'antd'
import {
  SaveOutlined,
  ApiOutlined,
  BranchesOutlined,
  ArrowLeftOutlined,
  UploadOutlined,
  CheckCircleFilled,
} from '@ant-design/icons'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useProjectStore, type ProjectInput } from '@stores/projectStore'
import api, { getErrorMessage } from '@services/serverApi'
import PageHeader from '@components/common/PageHeader'
import type { ProjectConfig as ProjectConfigType, EnvironmentType } from '@/types'

const ROBOT_OPTIONS = Array.from({ length: 30 }, (_, i) => ({
  label: `机器人 ${i + 1}`,
  value: i + 1,
}))
const TABS = ['basic', 'git', 'ci', 'env'] as const

function toFormValues(p: ProjectConfigType) {
  const env = p.environments || {}
  return {
    name: p.name,
    description: p.description,
    appId: p.appId,
    repoUrl: p.repoUrl,
    branch: p.branch,
    authType: p.authType,
    sshKeyPath: p.sshKeyPath,
    authToken: undefined,
    privateKey: undefined,
    projectPath: p.projectPath,
    installCommand: env.installCommand,
    buildCommand: env.buildCommand,
    miniprogramRoot: env.miniprogramRoot,
    npmBuild: !!env.npmBuild,
    dev: {
      robot: env.dev?.robot ?? 1,
      setting: { es6: true, es7: true, minify: false, ...env.dev?.setting },
    },
    prod: {
      robot: env.prod?.robot ?? 2,
      setting: { es6: true, es7: true, minify: true, ...env.prod?.setting },
    },
  }
}

const EnvSection: React.FC<{ env: EnvironmentType }> = ({ env }) => (
  <Card
    size="small"
    title={env === 'dev' ? '开发版（DEV）' : '正式版（PROD）'}
    className="env-config-card"
    extra={
      <Tag color={env === 'dev' ? 'blue' : 'orange'} variant="filled">
        {env.toUpperCase()}
      </Tag>
    }
  >
    <Form.Item
      name={[env, 'robot']}
      label="CI 机器人"
      tooltip="微信后台按机器人区分上传者，同一机器人的新上传会覆盖其上一个开发版本"
    >
      <Select options={ROBOT_OPTIONS} />
    </Form.Item>
    <div className="switch-list">
      <Form.Item name={[env, 'setting', 'es6']} label="ES6 转 ES5" valuePropName="checked">
        <Switch size="small" />
      </Form.Item>
      <Form.Item name={[env, 'setting', 'es7']} label="增强编译" valuePropName="checked">
        <Switch size="small" />
      </Form.Item>
      <Form.Item name={[env, 'setting', 'minify']} label="代码压缩" valuePropName="checked">
        <Switch size="small" />
      </Form.Item>
      <Form.Item name={[env, 'setting', 'codeProtect']} label="代码保护" valuePropName="checked">
        <Switch size="small" />
      </Form.Item>
    </div>
  </Card>
)

const ProjectConfig: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { message } = App.useApp()
  const { fetchProjectById, updateProject } = useProjectStore()
  const [project, setProject] = useState<ProjectConfigType | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [form] = Form.useForm()
  const fileInput = useRef<HTMLInputElement>(null)
  const authType = Form.useWatch('authType', form)

  const tabParam = params.get('tab')
  const activeTab = (TABS as readonly string[]).includes(tabParam || '')
    ? (tabParam as string)
    : 'basic'

  useEffect(() => {
    if (!projectId) return
    fetchProjectById(projectId).then((p) => {
      if (!p) {
        setNotFound(true)
        return
      }
      setProject(p)
      form.setFieldsValue(toFormValues(p))
    })
  }, [projectId, fetchProjectById, form])

  const handleSave = async () => {
    if (!projectId) return
    try {
      await form.validateFields()
    } catch {
      message.error('请检查标红的字段')
      return
    }
    // getFieldsValue(true) 取全部字段（含未激活 Tab），避免保存时把没打开过的 Tab 的配置清空
    const v = form.getFieldsValue(true)
    const payload: ProjectInput = {
      name: v.name?.trim(),
      description: v.description || '',
      appId: v.appId?.trim(),
      repoUrl: v.repoUrl?.trim(),
      branch: v.branch?.trim() || 'main',
      authType: v.authType,
      sshKeyPath: v.sshKeyPath?.trim() || '',
      projectPath: v.projectPath?.trim() || '',
      environments: {
        ...(v.privateKey?.trim() ? { private_key: v.privateKey.trim() } : {}),
        installCommand: v.installCommand?.trim() || '',
        buildCommand: v.buildCommand?.trim() || '',
        miniprogramRoot: v.miniprogramRoot?.trim() || '',
        npmBuild: !!v.npmBuild,
        dev: v.dev,
        prod: v.prod,
      },
    }
    if (v.authToken) payload.authToken = v.authToken

    setSaving(true)
    try {
      const updated = await updateProject(projectId, payload)
      setProject(updated)
      form.setFieldsValue({ authToken: undefined, privateKey: undefined })
      setDirty(false)
      message.success('配置已保存')
    } catch (err) {
      message.error(getErrorMessage(err, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    const v = form.getFieldsValue(true)
    if (!v.repoUrl) {
      message.warning('请先填写仓库地址')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const { data } = await api.post(
        '/git/test-connection',
        {
          repoUrl: v.repoUrl,
          authType: v.authType,
          sshKeyPath: v.authType === 'ssh' ? v.sshKeyPath : undefined,
          authToken: v.authType === 'token' ? v.authToken : undefined,
          projectId,
        },
        { timeout: 60000 },
      )
      setTestResult(
        data.success
          ? { ok: true, msg: '连接成功，仓库可访问' }
          : { ok: false, msg: data.error || '连接失败' },
      )
    } catch (err) {
      setTestResult({ ok: false, msg: getErrorMessage(err, '连接失败') })
    } finally {
      setTesting(false)
    }
  }

  const handleKeyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 32 * 1024) {
      message.error('文件过大，请确认选择的是小程序上传密钥（.key）')
      return
    }
    file.text().then((text) => {
      if (!text.includes('PRIVATE KEY')) {
        message.warning('文件内容不像私钥，请确认')
      }
      form.setFieldValue('privateKey', text)
      setDirty(true)
    })
  }

  if (notFound) {
    return (
      <Result
        status="404"
        title="项目不存在"
        subTitle="该项目可能已被删除"
        extra={<Button onClick={() => navigate('/projects')}>返回项目列表</Button>}
      />
    )
  }

  if (!project) {
    return (
      <div className="fullscreen-center fullscreen-center--inline">
        <Spin size="large" />
      </div>
    )
  }

  const issues: Array<{ text: string; tab: string }> = []
  if (!project.hasPrivateKey) issues.push({ text: '未配置小程序上传密钥', tab: 'ci' })
  if (project.authType === 'ssh' && !project.sshKeyPath)
    issues.push({ text: '未配置 SSH 私钥路径', tab: 'git' })

  const tabItems = [
    {
      key: 'basic',
      label: '基本信息',
      children: (
        <div className="form-section">
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, whitespace: true, message: '请输入项目名称' }]}
          >
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item
            name="appId"
            label="小程序 AppID"
            rules={[
              { required: true, message: '请输入 AppID' },
              { pattern: /^wx[0-9a-f]{16}$/i, message: 'AppID 格式应为 wx 开头的 18 位字符' },
            ]}
          >
            <Input className="mono" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'git',
      label: '代码仓库',
      children: (
        <div className="form-section">
          <Form.Item
            name="repoUrl"
            label="仓库地址"
            rules={[{ required: true, whitespace: true, message: '请输入仓库地址' }]}
          >
            <Input className="mono" placeholder="https://github.com/org/repo.git" />
          </Form.Item>
          <Form.Item name="branch" label="默认分支" extra="迭代中选择的分支优先于这里的默认分支">
            <Input prefix={<BranchesOutlined />} placeholder="main" />
          </Form.Item>
          <Form.Item name="authType" label="认证方式">
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
              label="SSH 私钥路径"
              extra="服务器上的私钥文件路径，需对后端进程可读"
            >
              <Input className="mono" placeholder="/root/.ssh/id_rsa" />
            </Form.Item>
          ) : (
            <Form.Item
              name="authToken"
              label="Access Token"
              extra={
                project.hasAuthToken
                  ? '已配置；留空表示不修改'
                  : 'GitHub PAT / GitLab Token 等，公开仓库可留空'
              }
            >
              <Input.Password
                placeholder={project.hasAuthToken ? '••••••••（已配置）' : 'ghp_xxx / glpat-xxx'}
                autoComplete="new-password"
              />
            </Form.Item>
          )}
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Button icon={<ApiOutlined />} onClick={handleTestConnection} loading={testing}>
              测试连接
            </Button>
            {testResult && (
              <Alert showIcon type={testResult.ok ? 'success' : 'error'} title={testResult.msg} />
            )}
          </Space>
        </div>
      ),
    },
    {
      key: 'ci',
      label: '构建与上传',
      children: (
        <div className="form-section">
          <Form.Item
            label={
              <Space>
                小程序上传密钥
                {project.hasPrivateKey && (
                  <Tag color="success" variant="filled" icon={<CheckCircleFilled />}>
                    已配置
                  </Tag>
                )}
              </Space>
            }
            extra={
              <>
                在微信公众平台「开发管理 → 开发设置 →
                小程序代码上传」生成并下载，同时需将本服务器出口 IP 加入白名单。
                {project.hasPrivateKey && ' 留空表示不修改。'}
              </>
            }
          >
            <Form.Item name="privateKey" noStyle>
              <Input.TextArea
                rows={6}
                className="mono"
                placeholder={
                  project.hasPrivateKey
                    ? '••••••••（已配置，粘贴新密钥可替换）'
                    : '-----BEGIN RSA PRIVATE KEY-----\n...'
                }
              />
            </Form.Item>
            <input
              type="file"
              accept=".key,.pem,.txt"
              ref={fileInput}
              hidden
              onChange={handleKeyFile}
            />
            <Button
              size="small"
              icon={<UploadOutlined />}
              onClick={() => fileInput.current?.click()}
              style={{ marginTop: 8 }}
            >
              从文件读取
            </Button>
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="buildCommand"
                label="编译命令"
                tooltip="Taro / uni-app 等编译型框架必填；原生小程序留空"
              >
                <Input className="mono" placeholder="npm run build:weapp" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="miniprogramRoot"
                label="小程序根目录"
                tooltip="包含 project.config.json 的目录（相对仓库根），原生小程序留空"
              >
                <Input className="mono" placeholder="dist/weapp" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="installCommand"
                label="依赖安装命令"
                tooltip="留空默认 npm install --legacy-peer-deps"
              >
                <Input className="mono" placeholder="pnpm install --frozen-lockfile" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="projectPath"
                label="本地项目路径"
                tooltip="填写后直接使用服务器上该目录的代码，不再拉取 Git 仓库（一般留空）"
              >
                <Input className="mono" placeholder="一般留空" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="npmBuild"
            label="构建小程序 npm"
            valuePropName="checked"
            extra="项目使用了小程序 npm 包时开启，等同于开发者工具的「构建 npm」"
          >
            <Switch />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'env',
      label: '环境配置',
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <EnvSection env="dev" />
          </Col>
          <Col xs={24} md={12}>
            <EnvSection env="prod" />
          </Col>
        </Row>
      ),
    },
  ]

  return (
    <div className="page">
      <PageHeader
        back={
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/projects')}
            aria-label="返回"
          />
        }
        title={project.name}
        description={<code className="mono">{project.appId}</code>}
        extra={
          <Space>
            {dirty && <span className="muted">有未保存的修改</span>}
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
              保存
            </Button>
          </Space>
        }
      />

      {issues.length > 0 && (
        <Alert
          type="warning"
          showIcon
          className="section"
          title="完成以下配置后才能成功构建"
          description={
            <ul className="issue-list">
              {issues.map((i) => (
                <li key={i.text}>
                  {i.text}
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setParams({ tab: i.tab }, { replace: true })}
                  >
                    去配置
                  </Button>
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Card variant="borderless">
        <Form form={form} layout="vertical" onValuesChange={() => setDirty(true)}>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setParams({ tab: key }, { replace: true })}
            items={tabItems.map((t) => ({ ...t, forceRender: true }))}
          />
        </Form>
      </Card>
    </div>
  )
}

export default ProjectConfig
