import { create } from 'zustand'
import api from '@services/serverApi'
import type { Iteration, CreateIterationParams, BuildRecord } from '@/types'

interface IterationState {
  iterations: Iteration[]
  loading: boolean
  fetchIterations: (opts?: { silent?: boolean }) => Promise<void>
  createIteration: (params: CreateIterationParams) => Promise<Iteration>
  closeIteration: (id: string) => Promise<void>
  reopenIteration: (id: string) => Promise<void>
  deleteIteration: (id: string) => Promise<void>
  triggerBuild: (iterationId: string) => Promise<BuildRecord>
}

function replace(list: Iteration[], next: Iteration) {
  return list.map((it) => (it.id === next.id ? { ...it, ...next } : it))
}

export const useIterationStore = create<IterationState>((set) => ({
  iterations: [],
  loading: false,

  fetchIterations: async (opts) => {
    if (!opts?.silent) set({ loading: true })
    try {
      const { data } = await api.get('/iterations')
      set({ iterations: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createIteration: async (params) => {
    const { data } = await api.post('/iterations', params)
    set((state) => ({ iterations: [data, ...state.iterations] }))
    return data
  },

  closeIteration: async (id) => {
    const { data } = await api.patch(`/iterations/${id}/close`)
    set((state) => ({ iterations: replace(state.iterations, data) }))
  },

  reopenIteration: async (id) => {
    const { data } = await api.patch(`/iterations/${id}/reopen`)
    set((state) => ({ iterations: replace(state.iterations, data) }))
  },

  deleteIteration: async (id) => {
    await api.delete(`/iterations/${id}`)
    set((state) => ({ iterations: state.iterations.filter((iter) => iter.id !== id) }))
  },

  triggerBuild: async (iterationId) => {
    const { data: build } = await api.post<BuildRecord>(`/iterations/${iterationId}/build`)
    set((state) => ({
      iterations: state.iterations.map((iter) =>
        iter.id === iterationId
          ? {
              ...iter,
              status: 'building',
              buildId: build.id,
              lastBuildStatus: build.status,
              lastBuildStart: build.startTime,
              lastBuildEnd: undefined,
            }
          : iter,
      ),
    }))
    return build
  },
}))
