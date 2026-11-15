import React, { useEffect, useState } from 'react'
import {
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Alert,
  Descriptions,
  Row,
  Col,
  Space,
  Spin,
  App,
} from 'antd'
import { SaveOutlined, SendOutlined } from '@ant-design/icons'
import api, { getErrorMessage } from '@services/serverApi'
import { useAuthStore } from '@stores/authStore'
import PageHeader from '@components/common/PageHeader'
import type { SystemInfo, SystemSettings } from '@/types'

interface SettingsResponse {
  settings: SystemSettings
  system: SystemInfo
}

function toForm(s: SystemSettings) {
  return {
    maxConcurrentBuilds: Number(s.maxConcurrentBuilds) || 2,
    webhookUrl: s.webhookUrl,
    notifyOnSuccess: s.notifyOnSuccess === 'true',
    notifyOnFailure: s.notifyOnFailure === 'true',
  }
}

const Settings: React.FC = () => {
  const { message } = App.useApp()
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const [form] = Form.useForm()
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    api
      .get<SettingsResponse>('/settings')
      .then(({ data }) => {
        form.setFieldsValue(toForm(data.settings))
        setSystem(data.system)
      })
      .catch((err) => message.error(getErrorMessage(err, '设置加载失败')))
      .finally(() => setLoading(false))
  }, [form, message])

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const { data } = await api.put<SettingsResponse>('/settings', {
        maxConcurrentBuilds: values.maxConcurrentBuilds,
        webhookUrl: values.webhookUrl?.trim() || '',
        notifyOnSuccess: !!values.notifyOnSuccess,
        notifyOnFailure: !!values.notifyOnFailure,
      })
      form.setFieldsValue(toForm(data.settings))
      setSystem(data.system)
      setDirty(false)
      message.success('设置已保存')
    } catch (err) {
      message.error(getErrorMessage(err, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    const webhookUrl = form.getFieldValue('webhookUrl')?.trim()
    if (!webhookUrl) {
      message.warning('请先填写 Webhook 地址')
      return
    }
    setTesting(true)
    try {
      await api.post('/settings/test-webhook', { webhookUrl })
      message.success('测试消息已发送，请在群里查看')
    } catch (err) {
      message.error(getErrorMessage(err, '发送失败'))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="系统设置"
        description="构建并发与结果通知。"
        extra={
          isAdmin && (
            <Space>
              {dirty && <span className="muted">有未保存的修改</span>}
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                保存
              </Button>
            </Space>
          )
        }
      />

      {!isAdmin && (
        <Alert className="section" type="info" showIcon title="仅管理员可以修改系统设置" />
      )}

      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          disabled={!isAdmin}
          onValuesChange={() => setDirty(true)}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card variant="borderless" title="构建" className="settings-card">
                <Form.Item
                  name="maxConcurrentBuilds"
                  label="最大并发构建数"
                  extra="超出的构建会排队等待。每个构建都会执行依赖安装和编译，请按服务器 CPU / 内存调整。"
                  rules={[{ required: true, message: '请输入并发数' }]}
                >
                  <InputNumber min={1} max={16} precision={0} style={{ width: 160 }} />
                </Form.Item>
                {system?.concurrencyFromEnv && (
                  <Alert
                    type="warning"
                    showIcon
                    title={`当前由环境变量 MAX_CONCURRENT_BUILDS=${system.concurrencyFromEnv} 控制，此处设置不生效`}
                  />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card variant="borderless" title="构建通知" className="settings-card">
                <Form.Item
                  name="webhookUrl"
                  label="企业微信机器人 Webhook"
                  extra="在企业微信群 → 群机器人 → 添加机器人后获取地址"
                  rules={[{ type: 'url', message: '请输入合法的 URL' }]}
                >
                  <Input
                    className="mono"
                    placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                    allowClear
                  />
                </Form.Item>
                <Space size={24} wrap>
                  <Form.Item name="notifyOnFailure" label="构建失败时通知" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Form.Item name="notifyOnSuccess" label="构建成功时通知" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Space>
                <div>
                  <Button icon={<SendOutlined />} onClick={handleTest} loading={testing}>
                    发送测试消息
                  </Button>
                </div>
              </Card>
            </Col>
          </Row>
        </Form>

        {system && (
          <Card variant="borderless" title="运行信息" className="section-top">
            <Descriptions
              size="small"
              column={{ xs: 1, md: 2 }}
              items={[
                {
                  key: 'queue',
                  label: '构建队列',
                  children: `${system.queue.activeCount} 个执行中，${system.queue.queuedCount} 个排队`,
                },
                {
                  key: 'retention',
                  label: '记录保留',
                  children:
                    system.logRetentionDays === 0
                      ? '永久保留'
                      : `${system.logRetentionDays} 天（LOG_RETENTION_DAYS）`,
                },
                {
                  key: 'sandbox',
                  label: '构建沙盒目录',
                  children: <span className="mono">{system.sandboxBase}</span>,
                },
                {
                  key: 'qrcode',
                  label: '二维码目录',
                  children: <span className="mono">{system.qrcodeBase}</span>,
                },
                {
                  key: 'node',
                  label: 'Node.js',
                  children: <span className="mono">{system.nodeVersion}</span>,
                },
              ]}
            />
            <p className="muted small">以上配置由服务端环境变量控制，修改后需重启服务。</p>
          </Card>
        )}
      </Spin>
    </div>
  )
}

export default Settings
