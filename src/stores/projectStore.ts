import { create } from 'zustand'
import api from '@services/serverApi'
import type { ProjectConfig, BuildRecord } from '@/types'

export type ProjectInput = Partial<Omit<ProjectConfig, 'id' | 'createdAt' | 'updatedAt'>>

interface ProjectState {
  projects: ProjectConfig[]
  builds: BuildRecord[]
  loading: boolean
  buildsLoading: boolean
  projectsLoaded: boolean
  fetchProjects: () => Promise<void>
  fetchProjectById: (id: string) => Promise<ProjectConfig | undefined>
  updateProject: (id: string, config: ProjectInput) => Promise<ProjectConfig>
  createProject: (config: ProjectInput) => Promise<ProjectConfig>
  deleteProject: (id: string) => Promise<void>
  fetchBuilds: (opts?: { silent?: boolean }) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  builds: [],
  loading: false,
  buildsLoading: false,
  projectsLoaded: false,

  fetchProjects: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/projects')
      set({ projects: data, loading: false, projectsLoaded: true })
    } catch {
      set({ loading: false })
    }
  },

  fetchProjectById: async (id) => {
    try {
      const { data } = await api.get(`/projects/${id}`)
      return data
    } catch {
      return undefined
    }
  },

  // 失败时向上抛出，由页面展示错误信息（之前吞掉异常导致失败也提示"保存成功"）
  updateProject: async (id, config) => {
    const { data } = await api.put(`/projects/${id}`, config)
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...data } : p)),
    }))
    return data
  },

  createProject: async (config) => {
    const { data } = await api.post('/projects', config)
    set((state) => ({ projects: [data, ...state.projects] }))
    return data
  },

  deleteProject: async (id) => {
    await api.delete(`/projects/${id}`)
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      builds: state.builds.filter((b) => b.projectId !== id),
    }))
  },

  fetchBuilds: async (opts) => {
    if (!opts?.silent) set({ buildsLoading: true })
    try {
      const { data } = await api.get('/builds')
      set({ builds: data, buildsLoading: false })
    } catch {
      set({ buildsLoading: false })
    }
  },
}))
