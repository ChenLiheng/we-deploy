import React from 'react'
import { Tag } from 'antd'
import { ENV_META, getBuildStatusMeta, getIterationStatusMeta } from '@/constants/status'
import type { EnvironmentType } from '@/types'

export const BuildStatusTag: React.FC<{ status?: string }> = ({ status }) => {
  const meta = getBuildStatusMeta(status)
  return (
    <Tag color={meta.color} icon={meta.icon} className="status-tag" variant="filled">
      {meta.label}
    </Tag>
  )
}

export const IterationStatusTag: React.FC<{ status?: string }> = ({ status }) => {
  const meta = getIterationStatusMeta(status)
  return (
    <Tag color={meta.color} icon={meta.icon} className="status-tag" variant="filled">
      {meta.label}
    </Tag>
  )
}

export const EnvTag: React.FC<{ env?: EnvironmentType | string; short?: boolean }> = ({
  env,
  short,
}) => {
  const meta = ENV_META[env as EnvironmentType]
  if (!meta) return <Tag>{env || '-'}</Tag>
  return (
    <Tag color={meta.color} variant="filled" className="env-tag">
      {short ? meta.short : meta.label}
    </Tag>
  )
}

export const PreviewTag: React.FC = () => (
  <Tag color="purple" variant="filled" className="env-tag">
    预览
  </Tag>
)
