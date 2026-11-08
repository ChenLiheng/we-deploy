import React from 'react'
import { Steps, Progress, Grid } from 'antd'
import { PIPELINE_STEPS } from '@/constants/status'
import type { BuildStatus } from '@/types'

/**
 * 构建流水线进度。失败时无法从状态得知失败在哪一步，
 * 因此由调用方传入 failedAt（最后一个非终态状态），默认标在最后一个已知阶段。
 */
const BuildSteps: React.FC<{
  status: BuildStatus
  failedAt?: BuildStatus
  size?: 'small' | 'medium'
  kind?: 'upload' | 'preview'
}> = ({ status, failedAt, size = 'small', kind = 'upload' }) => {
  const screens = Grid.useBreakpoint()
  const steps = PIPELINE_STEPS.map((s) =>
    s.key === 'uploading' && kind === 'preview' ? { ...s, title: '生成预览' } : s,
  )
  const keys = steps.map((s) => s.key)
  let current = keys.indexOf(status === 'pending' ? 'queued' : status)
  let stepStatus: 'wait' | 'process' | 'finish' | 'error' = 'process'

  if (status === 'success') {
    current = keys.length - 1
    stepStatus = 'finish'
  } else if (status === 'failed') {
    const idx = failedAt ? keys.indexOf(failedAt) : -1
    current = idx >= 0 ? idx : 1
    stepStatus = 'error'
  }

  // 窄屏下 6 个步骤横排会挤压成竖排文字，改为紧凑的进度条 + 当前阶段说明
  if (!screens.md) {
    const label =
      stepStatus === 'finish'
        ? '已完成'
        : stepStatus === 'error'
          ? `${steps[current].title}失败`
          : steps[current].title
    return (
      <div className="build-steps-compact">
        <div className="build-steps-compact__label">
          第 {current + 1}/{steps.length} 步 · {label}
        </div>
        <Progress
          percent={Math.round(
            ((current + (stepStatus === 'finish' ? 1 : 0.5)) / steps.length) * 100,
          )}
          status={
            stepStatus === 'error' ? 'exception' : stepStatus === 'finish' ? 'success' : 'active'
          }
          showInfo={false}
          size="small"
        />
      </div>
    )
  }

  return (
    <Steps
      size={size}
      current={current}
      status={stepStatus}
      responsive={false}
      className="build-steps"
      items={steps.map((s) => ({ title: s.title }))}
    />
  )
}

export default BuildSteps
