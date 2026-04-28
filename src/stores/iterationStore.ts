import { create } from 'zustand'
import api from '@services/serverApi'
import type { Iteration, CreateIterationParams, IterationStatus } from '@/types'
import { gitService } from '@services/gitService'
import { useProjectStore } from './projectStore'

interface IterationState {
  iterations: Iteration[]
  branches: string[]
  loading: boolean
  fetchingBranches: boolean
  fetchIterations: () => Promise<void>
  fetchIterationsByProject: (projectId: string) => Promise<void>
  createIteration: (params: CreateIterationParams) => Promise<Iteration>
  updateIteration: (id: string, updates: Partial<Iteration>) => Promise<void>
  closeIteration: (id: string) => Promise<void>
  deleteIteration: (id: string) => Promise<void>
  triggerBuild: (iterationId: string) => Promise<string>
  fetchBranches: (projectId: string) => Promise<void>
  getActiveIterations: () => Iteration[]
  getIterationsByProject: (projectId: string) => Iteration[]
  getIterationsByStatus: (status: IterationStatus) => Iteration[]
}

export const useIterationStore = create<IterationState>((set, get) => ({
  iterations: [],
  branches: [],
  loading: false,
  fetchingBranches: false,

  fetchIterations: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/iterations')
      set({ iterations: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchIterationsByProject: async (projectId: string) => {
    set({ loading: true })
    try {
      const { data } = await api.get('/iterations', { params: { projectId } })
      set({ iterations: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createIteration: async (params: CreateIterationParams) => {
    const { data } = await api.post('/iterations', params)
    set((state) => ({ iterations: [...state.iterations, data] }))
    return data
  },

  updateIteration: async (id: string, updates: Partial<Iteration>) => {
    // Optimistic local update
    set((state) => ({
      iterations: state.iterations.map((iter) =>
        iter.id === id ? { ...iter, ...updates, updatedAt: new Date().toISOString() } : iter,
      ),
    }))
  },

  closeIteration: async (id: string) => {
    const { data } = await api.patch(`/iterations/${id}/close`)
    set((state) => ({
      iterations: state.iterations.map((iter) =>
        iter.id === id ? { ...iter, ...data } : iter,
      ),
    }))
  },

  deleteIteration: async (id: string) => {
    await api.delete(`/iterations/${id}`)
    set((state) => ({
      iterations: state.iterations.filter((iter) => iter.id !== id),
    }))
  },

  triggerBuild: async (iterationId: string) => {
    const { data: build } = await api.post(`/iterations/${iterationId}/build`)
    set((state) => ({
      iterations: state.iterations.map((iter) =>
        iter.id === iterationId
          ? { ...iter, status: 'building' as IterationStatus, buildId: build.id, updatedAt: new Date().toISOString() }
          : iter,
      ),
    }))
    return build.id
  },

  fetchBranches: async (projectId: string) => {
    set({ fetchingBranches: true })
    try {
      const project = useProjectStore.getState().projects.find((p) => p.id === projectId)
      if (!project) throw new Error('项目不存在')
      const branches = await gitService.fetchBranches(
        project.repoUrl,
        project.authType,
        undefined,
        projectId,
      )
      set({ branches, fetchingBranches: false })
    } catch {
      set({ fetchingBranches: false, branches: [] })
    }
  },

  getActiveIterations: () => get().iterations.filter((i) => i.status === 'active'),
  getIterationsByProject: (projectId: string) =>
    get().iterations.filter((i) => i.projectId === projectId),
  getIterationsByStatus: (status: IterationStatus) =>
    get().iterations.filter((i) => i.status === status),
}))
