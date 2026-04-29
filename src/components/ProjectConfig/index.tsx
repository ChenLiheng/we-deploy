import React, { useEffect, useState, useCallback } from 'react'
import { Card, Form, Input, Select, Switch, Button, Tabs, message, Spin } from 'antd'
import { SaveOutlined, ApiOutlined, BranchesOutlined } from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { useProjectStore } from '@stores/projectStore'
import api from '@services/serverApi'
import type { ProjectConfig as ProjectConfigType, GitAuthType } from '@/types'
import './ProjectConfig.less'

const ProjectConfig: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { fetchProjectById, updateProject, loading } = useProjectStore()
  const [project, setProject] = useState<ProjectConfigType | null>(null)
  const [form] = Form.useForm()
  const [testingConnection, setTestingConnection] = useState(false)

  useEffect(() => {
    if (projectId) {
      fetchProjectById(projectId).then((p) => {
        if (p) {
          setProject(p)
          form.setFieldsValue({
            name: p.name,
            description: p.description,
            appId: p.appId,
            repoUrl: p.repoUrl,
            branch: p.branch,
            authType: p.authType,
            devRobot: p.environments.dev?.robot,
            devEs6: p.environments.dev?.setting?.es6,
            devEs7: p.environments.dev?.setting?.es7,
            devMinify: p.environments.dev?.setting?.minify,
            prodRobot: p.environments.prod?.robot,
            prodEs6: p.environments.prod?.setting?.es6,
            prodEs7: p.environments.prod?.setting?.es7,
            prodMinify: p.environments.prod?.setting?.minify,
            privateKey: undefined,
            // 编译型小程序框架支持：installCommand / buildCommand / miniprogramRoot / npmBuild
            installCommand: p.environments.installCommand,
            buildCommand: p.environments.buildCommand,
            miniprogramRoot: p.environments.miniprogramRoot,
            npmBuild: p.environments.npmBuild,
            projectPath: p.projectPath,
          })
        }
      })
    }
  }, [projectId, fetchProjectById, form])

  const handleSave = useCallback(async () => {
    if (!projectId) return
    try {
      const values = await form.validateFields()
      // Only send authToken if user actually entered a new value
      const updateData: any = {
        name: values.name,
        description: values.description,
        appId: values.appId,
        repoUrl: values.repoUrl,
        branch: values.branch,
        authType: values.authType,
        projectPath: values.projectPath,
      }
      if (values.authToken) {
        updateData.authToken = values.authToken
      }
      updateData.environments = {
        ...(values.privateKey ? { private_key: values.privateKey } : {}),
        // 编译型小程序框架（Taro/uni-app 等）所需字段：
        //  - installCommand：自定义依赖安装命令（pnpm/yarn 项目用）
        //  - buildCommand：clone 后执行的编译命令，例如 'npm run build:weapp'
        //  - miniprogramRoot：编译产物所在的小程序根目录（相对仓库根，如 'dist/weapp'）
        //  - npmBuild：是否调用 miniprogram-ci.packNpm 构建小程序 npm
        installCommand: values.installCommand,
        buildCommand: values.buildCommand,
        miniprogramRoot: values.miniprogramRoot,
        npmBuild: values.npmBuild,
        dev: {
          robot: values.devRobot,
          setting: {
            es6: values.devEs6,
            es7: values.devEs7,
            minify: values.devMinify,
          },
        },
        prod: {
          robot: values.prodRobot,
          setting: {
            es6: values.prodEs6,
            es7: values.prodEs7,
            minify: values.prodMinify,
          },
        },
      }
      await updateProject(projectId, updateData)
      message.success('项目配置已保存')
    } catch {
      /* 表单校验失败 */
    }
  }, [projectId, form, updateProject])

  const handleTestConnection = useCallback(async () => {
    setTestingConnection(true)
    try {
      const values = form.getFieldsValue()
      // Prefer token user just typed; fall back to projectId for DB lookup
      const payload: any = {
        repoUrl: values.repoUrl,
        authType: values.authType,
      }
      if (values.authType === 'ssh') {
        payload.sshKeyPath = values.sshKeyPath
      } else if (values.authToken) {
        payload.authToken = values.authToken
      } else if (projectId) {
        payload.projectId = projectId
      }
      const { data } = await api.post('/git/test-connection', payload)
      if (data.success) {
        message.success('Git 连接测试成功')
      } else {
        message.error(data.error || 'Git 连接测试失败')
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || err?.message || 'Git 连接测试失败'
      message.error(errorMsg)
    } finally {
      setTestingConnection(false)
    }
  }, [form, projectId])

  if (!project) {
    return (
      <div className="project-config-page loading">
        <Spin size="large" />
      </div>
    )
  }

  const tabItems = [
    {
      key: 'basic',
      label: '基础配置',
      children: (
        <div className="config-section">
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="项目名称" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea placeholder="项目描述" rows={3} />
          </Form.Item>
          <Form.Item
            name="appId"
            label="微信 AppID"
            rules={[{ required: true, message: '请输入微信 AppID' }]}
          >
            <Input placeholder="wx1234567890abcdef" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'git',
      label: 'Git 配置',
      children: (
        <div className="config-section">
          <Form.Item
            name="repoUrl"
            label="仓库地址"
            rules={[{ required: true, message: '请输入仓库地址' }]}
          >
            <Input
              prefix={<BranchesOutlined />}
              placeholder="https://github.com/example/repo.git"
            />
          </Form.Item>
          <Form.Item name="branch" label="默认分支">
            <Input placeholder="main" />
          </Form.Item>
          <Form.Item name="authType" label="认证方式">
            <Select
              options={[
                { label: 'Token 认证', value: 'token' as GitAuthType },
                { label: 'SSH 密钥', value: 'ssh' as GitAuthType },
              ]}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.authType !== next.authType}
          >
            {({ getFieldValue }) =>
              getFieldValue('authType') === 'ssh' ? (
                <Form.Item name="sshKeyPath" label="SSH 私钥路径">
                  <Input placeholder="/root/.ssh/id_rsa" />
                </Form.Item>
              ) : (
                <Form.Item name="authToken" label="Access Token" extra="Token 仅存储在后端，保存后不再返回前端">
                  <Input.Password
                    placeholder={project?.hasAuthToken ? '已配置（不修改请留空）' : 'ghp_xxxxxxxxxxxx'}
                  />
                </Form.Item>
              )
            }
          </Form.Item>
          <Button
            icon={<ApiOutlined />}
            className="test-btn"
            onClick={handleTestConnection}
            loading={testingConnection}
          >
            测试连接
          </Button>
        </div>
      ),
    },
    {
      key: 'ci',
      label: 'CI 配置',
      children: (
        <div className="config-section">
          <Form.Item name="privateKey" label="微信 CI 私钥">
            <Input.TextArea
              placeholder={project?.hasPrivateKey ? '已配置（不修改请留空）' : '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
              rows={10}
              className="code-textarea"
              style={{ fontFamily: 'var(--geek-font-mono)', fontSize: 12 }}
            />
          </Form.Item>
          <Form.Item
            name="installCommand"
            label="依赖安装命令（可选）"
            extra="留空则用默认 'npm install --legacy-peer-deps'。pnpm/yarn 项目可填写对应命令；遇到 ERESOLVE peer 冲突无法解决时可改为 'npm install --force'"
          >
            <Input placeholder="留空使用默认；或 'pnpm install --frozen-lockfile' / 'yarn install'" />
          </Form.Item>
          <Form.Item
            name="buildCommand"
            label="编译命令（可选）"
            extra="编译型框架（Taro/uni-app/Vue3）必填，例如 'npm run build:weapp'；原生小程序留空"
          >
            <Input placeholder="npm run build:weapp" />
          </Form.Item>
          <Form.Item
            name="miniprogramRoot"
            label="小程序根目录（可选）"
            extra="包含 project.config.json 的目录，相对仓库根；Taro 通常为 'dist/weapp'，原生小程序留空"
          >
            <Input placeholder="dist/weapp" />
          </Form.Item>
          <Form.Item
            name="npmBuild"
            label="构建小程序 npm"
            valuePropName="checked"
            extra="项目使用了小程序 npm 包时开启，对应微信开发者工具的「构建 npm」"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="projectPath" label="本地项目路径（可选）">
            <Input placeholder="/path/to/local/project" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'dev',
      label: 'DEV 环境',
      children: (
        <div className="config-section">
          <Form.Item name="devRobot" label="机器人编号">
            <Select
              options={Array.from({ length: 30 }, (_, i) => ({
                label: `Robot ${i + 1}`,
                value: i + 1,
              }))}
            />
          </Form.Item>
          <Form.Item name="devEs6" label="ES6 转 ES5" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="devEs7" label="增强编译" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="devMinify" label="代码压缩" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'prod',
      label: 'PROD 环境',
      children: (
        <div className="config-section">
          <Form.Item name="prodRobot" label="机器人编号">
            <Select
              options={Array.from({ length: 30 }, (_, i) => ({
                label: `Robot ${i + 1}`,
                value: i + 1,
              }))}
            />
          </Form.Item>
          <Form.Item name="prodEs6" label="ES6 转 ES5" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="prodEs7" label="增强编译" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="prodMinify" label="代码压缩" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
      ),
    },
  ]

  return (
    <div className="project-config-page">
      <div className="page-header">
        <div className="header-title">
          <span className="prompt">$</span>
          <h1>项目配置</h1>
          <code className="project-id">{project.name}</code>
        </div>
        <div className="header-actions">
          <Button className="geek-button-outline" onClick={() => navigate('/projects')}>
            返回
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            className="geek-button"
            onClick={handleSave}
            loading={loading}
          >
            保存配置
          </Button>
        </div>
      </div>

      <Card className="geek-card config-card">
        <Form form={form} layout="vertical" className="geek-form">
          <Tabs items={tabItems} className="geek-tabs" />
        </Form>
      </Card>
    </div>
  )
}

export default ProjectConfig
