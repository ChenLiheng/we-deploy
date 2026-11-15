import { create } from 'zustand'
import api, { TOKEN_STORAGE_KEY } from '@services/serverApi'

interface User {
  id: string
  username: string
  displayName: string
  email: string
  role: string
}

interface AuthState {
  token: string | null
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

export function getStoredAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token)
    else localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    /* 隐私模式等场景下 localStorage 不可用，仅影响刷新后保持登录 */
  }
}

function applyAuthHeader(token: string | null) {
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  else delete api.defaults.headers.common['Authorization']
}

applyAuthHeader(getStoredAuthToken())

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getStoredAuthToken(),
  user: null,
  loading: true,

  login: async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password })
    setStoredToken(data.token)
    applyAuthHeader(data.token)
    set({ token: data.token, user: data.user, loading: false })
  },

  logout: () => {
    setStoredToken(null)
    applyAuthHeader(null)
    set({ token: null, user: null })
  },

  fetchMe: async () => {
    const token = getStoredAuthToken()
    if (!token) {
      set({ loading: false, token: null })
      return
    }
    // 已有用户信息（例如刚登录）时不重复请求
    if (get().user && get().token === token) {
      set({ loading: false })
      return
    }
    try {
      applyAuthHeader(token)
      const { data } = await api.get('/auth/me')
      set({ user: data, loading: false, token })
    } catch {
      setStoredToken(null)
      applyAuthHeader(null)
      set({ token: null, user: null, loading: false })
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    await api.post('/auth/change-password', { currentPassword, newPassword })
  },
}))
