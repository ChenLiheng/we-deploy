import React from 'react'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleOutlined,
  LoadingOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { BuildStatus, EnvironmentType, IterationStatus } from '@/types'

export interface StatusMeta {
  label: string
  /** antd Tag / Badge 预设色 */
  color: 'default' | 'processing' | 'success' | 'error' | 'warning'
  icon: React.ReactNode
}

/**
 * 构建状态唯一配置源：Dashboard / 迭代 / 构建记录 / 控制台全部复用，
 * Record<BuildStatus, ...> 保证新增状态时编译期就会提示补齐。
 */
export const BUILD_STATUS: Record<BuildStatus, StatusMeta> = {
  pending: { label: '等待中', color: 'default', icon: <ClockCircleOutlined /> },
  queued: { label: '排队中', color: 'warning', icon: <ClockCircleOutlined /> },
  cloning: { label: '拉取代码', color: 'processing', icon: <LoadingOutlined /> },
  installing: { label: '安装依赖', color: 'processing', icon: <LoadingOutlined /> },
  building: { label: '编译中', color: 'processing', icon: <LoadingOutlined /> },
  uploading: { label: '上传中', color: 'processing', icon: <LoadingOutlined /> },
  success: { label: '成功', color: 'success', icon: <CheckCircleFilled /> },
  failed: { label: '失败', color: 'error', icon: <CloseCircleFilled /> },
}

const UNKNOWN_STATUS: StatusMeta = {
  label: '未知',
  color: 'default',
  icon: <MinusCircleOutlined />,
}

export function getBuildStatusMeta(status?: string): StatusMeta {
  return (status && BUILD_STATUS[status as BuildStatus]) || UNKNOWN_STATUS
}

export const ITERATION_STATUS: Record<IterationStatus, StatusMeta> = {
  active: { label: '进行中', color: 'success', icon: <CheckCircleFilled /> },
  building: { label: '构建中', color: 'processing', icon: <LoadingOutlined /> },
  closed: { label: '已关闭', color: 'default', icon: <MinusCircleOutlined /> },
}

export function getIterationStatusMeta(status?: string): StatusMeta {
  return (status && ITERATION_STATUS[status as IterationStatus]) || UNKNOWN_STATUS
}

export const ENV_META: Record<EnvironmentType, { label: string; short: string; color: string }> = {
  dev: { label: '开发版', short: 'DEV', color: 'blue' },
  prod: { label: '正式版', short: 'PROD', color: 'orange' },
}

/** 构建流水线阶段（用于进度条展示） */
export const PIPELINE_STEPS: Array<{ key: BuildStatus; title: string }> = [
  { key: 'queued', title: '排队' },
  { key: 'cloning', title: '拉取代码' },
  { key: 'installing', title: '安装依赖' },
  { key: 'building', title: '编译' },
  { key: 'uploading', title: '上传' },
  { key: 'success', title: '完成' },
]

export const TERMINAL_STATUSES: BuildStatus[] = ['success', 'failed']

export function isTerminal(status?: string): boolean {
  return status === 'success' || status === 'failed'
}

export function isRunning(status?: string): boolean {
  return !!status && !isTerminal(status)
}

export function formatDuration(start?: string, end?: string): string {
  if (!start) return '-'
  const endTs = end ? dayjs(end) : dayjs()
  return formatSeconds(endTs.diff(dayjs(start), 'second'))
}

export function formatSeconds(total: number): string {
  const sec = Math.max(0, Math.round(total))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}时${m}分`
  if (m > 0) return `${m}分${s}秒`
  return `${s}秒`
}

export function formatTime(value?: string, fmt = 'MM-DD HH:mm'): string {
  return value ? dayjs(value).format(fmt) : '-'
}

/** 「3 分钟前」风格的相对时间，避免引入 dayjs relativeTime 插件 */
export function fromNow(value?: string): string {
  if (!value) return '-'
  const diff = Math.max(0, dayjs().diff(dayjs(value), 'second'))
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
  return dayjs(value).format('YYYY-MM-DD')
}

/** 基于上一个版本号推荐下一个补丁版本：1.2.3 → 1.2.4 */
export function suggestNextVersion(prev?: string): string {
  if (!prev) return '1.0.0'
  const match = prev.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return prev
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}
