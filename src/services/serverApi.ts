import axios, { AxiosError } from 'axios'

export const TOKEN_STORAGE_KEY = 'we_deploy_token'

const api = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || '/api',
  timeout: 30000,
})

// 登录态失效（token 过期 / 服务端密钥轮换）时统一回到登录页，
// 避免各页面停留在"空白 + 一堆请求失败"的状态。
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url || ''
    if (error.response?.status === 401 && !url.includes('/auth/login')) {
      try {
        localStorage.removeItem(TOKEN_STORAGE_KEY)
      } catch {
        /* ignore */
      }
      delete api.defaults.headers.common['Authorization']
      if (!window.location.pathname.startsWith('/login')) {
        const from = window.location.pathname + window.location.search
        window.location.assign(`/login?expired=1&from=${encodeURIComponent(from)}`)
      }
    }
    return Promise.reject(error)
  },
)

/** 从 axios 错误中提取后端返回的中文错误信息 */
export function getErrorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
  const e = err as AxiosError<{ error?: string; message?: string }>
  if (e?.response?.data?.error) return e.response.data.error
  if (e?.code === 'ECONNABORTED') return '请求超时，请检查网络或稍后重试'
  if (e?.response?.status && e.response.status >= 500) return `服务器错误（${e.response.status}）`
  if (e && !e.response && e.message === 'Network Error') return '无法连接服务器'
  return fallback
}

export default api
