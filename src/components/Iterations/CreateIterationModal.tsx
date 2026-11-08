import React, { useEffect, useState } from 'react'
import { Modal, Form, Input, Select, AutoComplete, Radio, Checkbox, App, Alert } from 'antd'
import { BranchesOutlined } from '@ant-design/icons'
import { useProjectStore } from '@stores/projectStore'
import { useIterationStore } from '@stores/iterationStore'
import { gitService } from '@services/gitService'
import { getErrorMessage } from '@services/serverApi'
import { suggestNextVersion } from '@/constants/status'
import type { Iteration, EnvironmentType } from '@/types'

const VERSION_PATTERN = /^\d+(\.\d+){1,3}([-+.][0-9A-Za-z.-]+)?$/

interface Props {
  open: boolean
  defaultProjectId?: string
  onClose: () => void
  onCreated: (iteration: Iteration, buildNow: boolean) => void
}

const CreateIterationModal: React.FC<Props> = ({ open, defaultProjectId, onClose, onCreated }) => {
  const { message } = App.useApp()
  const projects = useProjectStore((s) => s.projects)
  const createIteration = useIterationStore((s) => s.createIteration)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [branchError, setBranchError] = useState<string>()
  const [loadingBranches, setLoadingBranches] = useState(false)
  const projectId = Form.useWatch('projectId', form) as string | undefined
  const buildNow = Form.useWatch('buildNow', form) as boolean | undefined
  const environment = Form.useWatch('environment', form) as EnvironmentType | undefined

  // 选择项目后：拉取远端分支 + 推荐下一个版本号 + 默认分支
  useEffect(() => {
    if (!open || !projectId) return
    const project = projects.find((p) => p.id === projectId)
    if (!project) return

    const last = useIterationStore
      .getState()
      .iterations.filter((i) => i.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (!form.isFieldTouched('version'))
      form.setFieldValue('version', suggestNextVersion(last?.version))
    if (!form.isFieldTouched('branch')) form.setFieldValue('branch', project.branch || 'main')

    let cancelled = false
    setLoadingBranches(true)
    setBranchError(undefined)
    setBranches([])
    gitService
      .fetchBranches({ repoUrl: project.repoUrl, authType: project.authType, projectId })
      .then((res) => {
        if (cancelled) return
        setBranches(res.branches)
        if (res.error) setBranchError(res.error)
      })
      .catch((err) => !cancelled && setBranchError(getErrorMessage(err, '分支获取失败')))
      .finally(() => !cancelled && setLoadingBranches(false))
    return () => {
      cancelled = true
    }
  }, [open, projectId, projects, form])

  useEffect(() => {
    if (open) {
      form.resetFields()
      if (defaultProjectId) form.setFieldValue('projectId', defaultProjectId)
    }
  }, [open, defaultProjectId, form])

  const handleOk = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const iteration = await createIteration({
        projectId: values.projectId,
        name: values.name?.trim() || `v${values.version}`,
        description: values.description,
        branch: values.branch.trim(),
        version: values.version.trim(),
        environment: values.environment,
      })
      onCreated(iteration, !!values.buildNow)
    } catch (err) {
      message.error(getErrorMessage(err, '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="发布新版本"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={saving}
      okText={buildNow ? '创建并开始构建' : '创建迭代'}
      cancelText="取消"
      width={560}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ environment: 'dev', buildNow: true }}>
        <Form.Item
          name="projectId"
          label="项目"
          rules={[{ required: true, message: '请选择项目' }]}
        >
          <Select
            placeholder="选择项目"
            showSearch
            optionFilterProp="label"
            options={projects.map((p) => ({ label: p.name, value: p.id }))}
          />
        </Form.Item>
        <Form.Item
          name="branch"
          label="分支"
          rules={[{ required: true, whitespace: true, message: '请选择或输入分支' }]}
          extra={
            loadingBranches
              ? '正在获取远端分支…'
              : branchError
                ? undefined
                : projectId && branches.length > 0
                  ? `共 ${branches.length} 个远端分支，可输入筛选`
                  : undefined
          }
        >
          <AutoComplete
            disabled={!projectId}
            placeholder={projectId ? '选择或输入分支名' : '请先选择项目'}
            options={branches.map((b) => ({ label: b, value: b }))}
            filterOption={(input, option) =>
              String(option?.value || '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
          >
            <Input prefix={<BranchesOutlined />} />
          </AutoComplete>
        </Form.Item>
        {branchError && (
          <Alert
            type="warning"
            showIcon
            className="form-alert"
            title="无法获取远端分支，可手动输入分支名"
            description={branchError}
          />
        )}
        <Form.Item
          name="version"
          label="版本号"
          tooltip="上传到微信后台显示的版本号，已根据该项目上一个迭代自动递增"
          rules={[
            { required: true, message: '请输入版本号' },
            { pattern: VERSION_PATTERN, message: '格式示例：1.2.3 或 1.2.3-beta.1' },
          ]}
        >
          <Input className="mono" placeholder="1.0.0" />
        </Form.Item>
        <Form.Item name="environment" label="目标环境" rules={[{ required: true }]}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: '开发版 DEV', value: 'dev' },
              { label: '正式版 PROD', value: 'prod' },
            ]}
          />
        </Form.Item>
        {environment === 'prod' && (
          <Alert
            type="info"
            showIcon
            className="form-alert"
            title="正式版使用 PROD 环境的编译配置和机器人上传，上传后仍需在微信后台提交审核。"
          />
        )}
        <Form.Item name="name" label="迭代名称" extra="留空则使用版本号作为名称">
          <Input placeholder="例如：首页改版" maxLength={50} />
        </Form.Item>
        <Form.Item name="description" label="更新说明">
          <Input.TextArea rows={2} maxLength={200} placeholder="本次迭代主要内容（可选）" />
        </Form.Item>
        <Form.Item name="buildNow" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Checkbox>创建后立即开始构建</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default CreateIterationModal
