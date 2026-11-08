import React, { useState } from 'react'
import { Layout, Menu, Avatar, Dropdown, Drawer, Button, Grid, App } from 'antd'
import {
  AppstoreOutlined,
  RocketOutlined,
  HistoryOutlined,
  SettingOutlined,
  DashboardOutlined,
  LogoutOutlined,
  KeyOutlined,
  MenuOutlined,
  BookOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@stores/authStore'
import ChangePasswordModal from '@components/common/ChangePasswordModal'

const { Header, Sider, Content } = Layout

const MENU_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/projects', icon: <AppstoreOutlined />, label: '项目' },
  { key: '/iterations', icon: <RocketOutlined />, label: '迭代发布' },
  { key: '/builds', icon: <HistoryOutlined />, label: '构建记录' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
]

/** 根据当前路径选中菜单：/projects/:id/config 等子页面归属到对应一级菜单 */
function getSelectedKey(pathname: string): string {
  if (/^\/projects\/[^/]+\/builds\//.test(pathname)) return '/builds'
  const hit = MENU_ITEMS.find((m) => pathname === m.key || pathname.startsWith(`${m.key}/`))
  return hit?.key || '/dashboard'
}

const Logo: React.FC = () => (
  <div className="app-logo">
    <div className="app-logo__mark">
      <RocketOutlined />
    </div>
    <div className="app-logo__text">
      <span className="app-logo__name">WeDeploy</span>
      <span className="app-logo__sub">小程序发布平台</span>
    </div>
  </div>
)

const MainLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  const screens = Grid.useBreakpoint()
  const isDesktop = !!screens.lg
  const { user, logout } = useAuthStore()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)

  const selectedKey = getSelectedKey(location.pathname)

  const handleLogout = () => {
    logout()
    message.success('已退出登录')
    navigate('/login', { replace: true })
  }

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={MENU_ITEMS}
      onClick={({ key }) => {
        navigate(key)
        setDrawerOpen(false)
      }}
      className="app-menu"
    />
  )

  const displayName = user?.displayName || user?.username || '用户'

  return (
    <Layout className="app-layout">
      {isDesktop && (
        <Sider width={224} className="app-sider">
          <Logo />
          {menu}
          <a
            className="app-sider__footer"
            href="https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html"
            target="_blank"
            rel="noreferrer"
          >
            <BookOutlined /> miniprogram-ci 文档
          </a>
        </Sider>
      )}

      <Drawer
        placement="left"
        open={!isDesktop && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size={240}
        closable={false}
        styles={{ body: { padding: 0 } }}
      >
        <Logo />
        {menu}
      </Drawer>

      <Layout className="app-main" style={{ marginLeft: isDesktop ? 224 : 0 }}>
        <Header className="app-header">
          <div className="app-header__left">
            {!isDesktop && (
              <>
                <Button
                  type="text"
                  icon={<MenuOutlined />}
                  onClick={() => setDrawerOpen(true)}
                  aria-label="打开菜单"
                />
                <span className="app-header__brand">WeDeploy</span>
              </>
            )}
          </div>
          <Dropdown
            placement="bottomRight"
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'info',
                  label: (
                    <div className="user-menu__info">
                      <div className="user-menu__name">{displayName}</div>
                      <div className="user-menu__role">
                        {user?.username} · {user?.role === 'admin' ? '管理员' : '成员'}
                      </div>
                    </div>
                  ),
                  disabled: true,
                },
                { type: 'divider' },
                {
                  key: 'password',
                  icon: <KeyOutlined />,
                  label: '修改密码',
                  onClick: () => setPwdOpen(true),
                },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  danger: true,
                  onClick: handleLogout,
                },
              ],
            }}
          >
            <button type="button" className="user-trigger">
              <Avatar size={30} className="user-trigger__avatar">
                {displayName.slice(0, 1).toUpperCase()}
              </Avatar>
              {screens.sm && <span className="user-trigger__name">{displayName}</span>}
            </button>
          </Dropdown>
        </Header>

        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>

      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </Layout>
  )
}

export default MainLayout
