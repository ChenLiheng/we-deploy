import React, { useState, useCallback, useEffect } from 'react'
import { Card, Form, Input, Switch, Button, Tabs, message, Divider, Spin } from 'antd'
import { SaveOutlined, ApiOutlined, BellOutlined, SecurityScanOutlined } from '@ant-design/icons'
import api from '@services/serverApi'
import './Settings.less'

const Settings: React.FC = () => {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get('/settings')
      .then(({ data }) => {
        form.setFieldsValue({
          apiBaseUrl: data.apiBaseUrl || 'http://localhost:8080',
          apiTimeout: Number(data.apiTimeout) || 30000,
          buildSandboxPath: data.buildSandboxPath || '/tmp/we-deploy/builds',
          maxConcurrentBuilds: Number(data.maxConcurrentBuilds) || 3,
          autoClearBuilds: data.autoClearBuilds === 'true',
          notifyOnSuccess: data.notifyOnSuccess === 'true',
          notifyOnFailure: data.notifyOnFailure === 'true',
          webhookUrl: data.webhookUrl || '',
          enableAuth: data.enableAuth === 'true',
          encryptionKey: data.encryptionKey || '',
        })
      })
      .catch(() => {
        // use defaults
      })
      .finally(() => setLoading(false))
  }, [form])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const values = form.getFieldsValue()
      await api.put('/settings', {
        ...values,
        apiTimeout: String(values.apiTimeout),
        maxConcurrentBuilds: String(values.maxConcurrentBuilds),
        autoClearBuilds: values.autoClearBuilds ? 'true' : 'false',
        notifyOnSuccess: values.notifyOnSuccess ? 'true' : 'false',
        notifyOnFailure: values.notifyOnFailure ? 'true' : 'false',
        enableAuth: values.enableAuth ? 'true' : 'false',
      })
      message.success('系统设置已保存')
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }, [form])

  const tabItems = [
    {
      key: 'general',
      label: (
        <span>
          <ApiOutlined /> 通用设置
        </span>
      ),
      children: (
        <div className="config-section">
          <h3 className="section-title">{'// 后端服务配置'}</h3>
          <Form.Item name="apiBaseUrl" label="API 地址">
            <Input placeholder="http://localhost:8080" />
          </Form.Item>
          <Form.Item name="apiTimeout" label="请求超时 (ms)">
            <Input placeholder="30000" type="number" />
          </Form.Item>
          <Divider />
          <h3 className="section-title">{'// 构建配置'}</h3>
          <Form.Item name="buildSandboxPath" label="构建沙箱路径">
            <Input placeholder="/tmp/we-deploy/builds" />
          </Form.Item>
          <Form.Item name="maxConcurrentBuilds" label="最大并发构建数">
            <Input placeholder="3" type="number" />
          </Form.Item>
          <Form.Item name="autoClearBuilds" label="自动清理构建产物" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'notification',
      label: (
        <span>
          <BellOutlined /> 通知设置
        </span>
      ),
      children: (
        <div className="config-section">
          <h3 className="section-title">{'// 构建通知'}</h3>
          <Form.Item name="notifyOnSuccess" label="构建成功通知" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notifyOnFailure" label="构建失败通知" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Divider />
          <h3 className="section-title">{'// 企业微信机器人'}</h3>
          <Form.Item name="webhookUrl" label="Webhook 地址">
            <Input placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'security',
      label: (
        <span>
          <SecurityScanOutlined /> 安全设置
        </span>
      ),
      children: (
        <div className="config-section">
          <h3 className="section-title">{'// 访问控制'}</h3>
          <Form.Item name="enableAuth" label="启用登录认证" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Divider />
          <h3 className="section-title">{'// 密钥管理'}</h3>
          <Form.Item name="encryptionKey" label="数据加密密钥">
            <Input.Password placeholder="用于加密敏感数据" />
          </Form.Item>
        </div>
      ),
    },
  ]

  return (
    <div className="settings-page">
      <div className="page-header">
        <div className="header-title">
          <span className="prompt">$</span>
          <h1>系统设置</h1>
          <span className="cursor-blink">{'█'}</span>
        </div>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          className="geek-button"
          onClick={handleSave}
          loading={saving}
        >
          保存设置
        </Button>
      </div>

      <Card className="geek-card settings-card">
        <Spin spinning={loading}>
          <Form form={form} layout="vertical" className="geek-form">
            <Tabs items={tabItems} className="geek-tabs" tabPosition="left" />
          </Form>
        </Spin>
      </Card>
    </div>
  )
}

export default Settings
