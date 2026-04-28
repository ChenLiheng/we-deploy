import { create } from 'zustand'
import api from '@services/serverApi'
import type { ProjectConfig, BuildRecord, EnvironmentType } from '@/types'

interface ProjectState {
  projects: ProjectConfig[]
  builds: BuildRecord[]
  loading: boolean
  fetchProjects: () => Promise<void>
  fetchProjectById: (id: string) => Promise<ProjectConfig | undefined>
  updateProject: (id: string, config: Partial<ProjectConfig>) => Promise<void>
  createProject: (
    config: Omit<ProjectConfig, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<ProjectConfig>
  deleteProject: (id: string) => Promise<void>
  fetchBuilds: (projectId?: string) => Promise<void>
  getLatestBuild: (projectId: string, env: EnvironmentType) => BuildRecord | undefined
  testGitConnection: (config: {
    repoUrl: string
    authType: string
    authToken?: string
  }) => Promise<boolean>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  builds: [],
  loading: false,

  fetchProjects: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/projects')
      set({ projects: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchProjectById: async (id: string) => {
    set({ loading: true })
    try {
      const { data } = await api.get(`/projects/${id}`)
      set({ loading: false })
      return data
    } catch {
      set({ loading: false })
      return undefined
    }
  },

  updateProject: async (id: string, config: Partial<ProjectConfig>) => {
    set({ loading: true })
    try {
      const { data } = await api.put(`/projects/${id}`, config)
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, ...data } : p)),
        loading: false,
      }))
    } catch {
      set({ loading: false })
    }
  },

  createProject: async (config) => {
    const { data } = await api.post('/projects', config)
    set((state) => ({ projects: [...state.projects, data] }))
    return data
  },

  deleteProject: async (id: string) => {
    await api.delete(`/projects/${id}`)
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      builds: state.builds.filter((b) => b.projectId !== id),
    }))
  },

  fetchBuilds: async (projectId?: string) => {
    set({ loading: true })
    try {
      const params = projectId ? { projectId } : {}
      const { data } = await api.get('/builds', { params })
      set({ builds: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  getLatestBuild: (projectId: string, env: EnvironmentType) => {
    return get()
      .builds.filter((b) => b.projectId === projectId && b.environment === env)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0]
  },

  testGitConnection: async ({ repoUrl, authType, authToken }) => {
    try {
      const { data } = await api.post('/git/test-connection', { repoUrl, authType, authToken })
      return data.success
    } catch {
      return false
    }
  },
}))
