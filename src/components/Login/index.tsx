import React, { useState } from 'react'
import { Form, Input, Button, Alert, App } from 'antd'
import { UserOutlined, LockOutlined, RocketOutlined, CheckCircleFilled } from '@ant-design/icons'
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import { useAuthStore } from '@stores/authStore'
import { getErrorMessage } from '@services/serverApi'

const FEATURES = [
  '无需打开微信开发者工具，浏览器里完成上传与预览',
  '按迭代管理分支、版本号与目标环境',
  '支持 Taro / uni-app 等编译型框架',
  '构建日志实时推送，失败原因一目了然',
]

function safeRedirect(from: string | null): string {
  // 只允许站内相对路径，防止 ?from= 被用于开放重定向
  if (from && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/login'))
    return from
  return '/dashboard'
}

const Login: React.FC = () => {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { message } = App.useApp()
  const { login, token } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = safeRedirect(params.get('from'))
  const expired = params.get('expired') === '1'

  if (token) return <Navigate to={from} replace />

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true)
    setError(null)
    try {
      await login(values.username.trim(), values.password)
      message.success('登录成功')
      navigate(from, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, '登录失败，请检查用户名和密码'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="login-hero__brand">
          <div className="app-logo__mark app-logo__mark--lg">
            <RocketOutlined />
          </div>
          <span>WeDeploy</span>
        </div>
        <h1 className="login-hero__title">
          小程序发布，
          <br />
          一键完成。
        </h1>
        <ul className="login-hero__features">
          {FEATURES.map((f) => (
            <li key={f}>
              <CheckCircleFilled /> {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <h2>登录</h2>
          <p className="login-card__sub">使用管理员分配的账号登录</p>

          {expired && !error && (
            <Alert
              type="warning"
              showIcon
              title="登录已过期，请重新登录"
              className="login-card__alert"
            />
          )}
          {error && <Alert type="error" showIcon title={error} className="login-card__alert" />}

          <Form onFinish={handleSubmit} layout="vertical" size="large" requiredMark={false}>
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="用户名"
                autoComplete="username"
                autoFocus
              />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
                autoComplete="current-password"
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form>

          <p className="login-card__hint">
            首次部署？初始管理员密码会打印在后端启动日志中（搜索 “Initial admin password”）。
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login
