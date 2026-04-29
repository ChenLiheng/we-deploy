import { create } from 'zustand'
import api from '@services/serverApi'

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
}

export function getStoredAuthToken(): string | null {
  try {
    return localStorage.getItem('we_deploy_token')
  } catch {
    return null
  }
}

function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem('we_deploy_token', token)
  } else {
    localStorage.removeItem('we_deploy_token')
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getStoredAuthToken(),
  user: null,
  loading: true,

  login: async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password })
    setStoredToken(data.token)
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
    set({ token: data.token, user: data.user })
  },

  logout: () => {
    setStoredToken(null)
    delete api.defaults.headers.common['Authorization']
    set({ token: null, user: null })
  },

  fetchMe: async () => {
    const token = getStoredAuthToken()
    if (!token) {
      set({ loading: false })
      return
    }
    try {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      const { data } = await api.get('/auth/me')
      set({ user: data, loading: false, token })
    } catch {
      setStoredToken(null)
      set({ token: null, user: null, loading: false })
    }
  },
}))

// Set default auth header when token is available
const token = getStoredAuthToken()
if (token) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
}
