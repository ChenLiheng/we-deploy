import React, { useState, useCallback } from 'react'
import { Form, Input, Button, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@stores/authStore'
import './Login.less'

const Login: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((s) => s.login)
  const [loading, setLoading] = useState(false)

  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const handleSubmit = useCallback(
    async (values: { username: string; password: string }) => {
      setLoading(true)
      try {
        await login(values.username, values.password)
        message.success('登录成功')
        navigate(from, { replace: true })
      } catch (err: any) {
        const msg = err?.response?.data?.error || '登录失败，请检查用户名和密码'
        message.error(msg)
      } finally {
        setLoading(false)
      }
    },
    [login, navigate, from],
  )

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo">
            <span className="prompt">$</span>
            <span className="logo-text">we-deploy</span>
          </div>
          <p className="subtitle">微信小程序自动化打包与发布平台</p>
        </div>

        <div className="login-box">
          <div className="terminal-bar">
            <div className="dots">
              <span className="dot red"></span>
              <span className="dot yellow"></span>
              <span className="dot green"></span>
            </div>
            <span className="title">authentication — login</span>
          </div>

          <div className="login-form-wrapper">
            <span className="prompt-line">
              <span className="prompt-char">$</span> 请输入登录凭证
            </span>

            <Form onFinish={handleSubmit} layout="vertical" className="login-form" size="large">
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input
                  prefix={<UserOutlined />}
                  placeholder="用户名"
                  className="login-input"
                />
              </Form.Item>

              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="密码"
                  className="login-input"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  className="login-button"
                >
                  {loading ? '验证中...' : '登录'}
                </Button>
              </Form.Item>
            </Form>

            <div className="login-hint">
              <span className="comment">// 默认账号: admin / admin123</span>
            </div>
          </div>
        </div>

        <div className="login-footer">
          <span className="status-dot online"></span>
          <span className="status-text">WeDeploy v1.0.0</span>
        </div>
      </div>
    </div>
  )
}

export default Login
