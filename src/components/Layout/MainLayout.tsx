import React from 'react'
import { Layout, Menu, Avatar, Dropdown, message } from 'antd'
import {
  ProjectOutlined,
  CloudUploadOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  CodeOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@stores/authStore'
import './MainLayout.less'

const { Header, Sider, Content } = Layout

const MainLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const menuItems = [
    { key: '/dashboard', icon: <CodeOutlined />, label: '控制台' },
    { key: '/projects', icon: <ProjectOutlined />, label: '项目管理' },
    { key: '/iterations', icon: <RocketOutlined />, label: '迭代管理' },
    { key: '/builds', icon: <CloudUploadOutlined />, label: '构建历史' },
    { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
  ]

  const handleLogout = () => {
    logout()
    message.success('已退出登录')
    navigate('/login', { replace: true })
  }

  const userMenuItems = [
    {
      key: 'info',
      label: (
        <span style={{ fontFamily: 'var(--geek-font-mono)', fontSize: 12, color: '#8b949e' }}>
          {user?.username || user?.email}
        </span>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ]

  const pathMap: Record<string, string> = {
    '/dashboard': 'dashboard',
    '/projects': 'projects',
    '/iterations': 'iterations',
    '/builds': 'builds',
    '/settings': 'settings',
  }

  const currentPath = pathMap[location.pathname] || location.pathname.split('/').pop() || ''

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="dark"
        breakpoint="lg"
        collapsedWidth="80"
        style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100, height: '100vh' }}
      >
        <div className="sider-inner">
          <div className="logo">
            <div className="logo-icon">
              <span className="prompt">$</span>
            </div>
            <span className="logo-text">we-deploy</span>
          </div>
          <div className="menu-wrapper">
            <Menu
              theme="dark"
              mode="inline"
              selectedKeys={[location.pathname]}
              items={menuItems}
              onClick={({ key }) => navigate(key)}
              className="geek-menu"
            />
          </div>
          <div className="terminal-footer">
            <div className="status-line">
              <span className="status-dot online"></span>
              <span className="status-text">SYSTEM ONLINE</span>
            </div>
          </div>
        </div>
      </Sider>

      <Layout style={{ marginLeft: 200 }}>
        <Header className="site-layout-header">
          <div className="header-left">
            <div className="breadcrumb">
              <span className="breadcrumb-item">~/we-deploy</span>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-current">{currentPath}</span>
            </div>
          </div>

          <div className="header-right">
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div className="user-info">
                <Avatar icon={<UserOutlined />} className="geek-avatar" />
                <span className="username">{user?.displayName || user?.username || '用户'}</span>
                <span className="cursor-blink">{'█'}</span>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="site-layout-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
