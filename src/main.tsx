import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import App from './App'
import './index.less'

dayjs.locale('zh-cn')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#07c160',
            colorInfo: '#1677ff',
            colorSuccess: '#07c160',
            colorWarning: '#fa9d3b',
            colorError: '#f53f3f',
            colorTextBase: '#1d2129',
            colorBgLayout: '#f4f6f9',
            borderRadius: 8,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif",
          },
          components: {
            Layout: { siderBg: '#ffffff', headerBg: '#ffffff', bodyBg: '#f4f6f9' },
            Menu: {
              itemBg: 'transparent',
              itemSelectedBg: '#e8f8ef',
              itemSelectedColor: '#06ad56',
            },
            Table: { headerBg: '#fafbfc', headerColor: '#4e5969' },
            Card: { headerFontSize: 15 },
          },
        }}
      >
        <AntApp>
          <App />
        </AntApp>
      </ConfigProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
