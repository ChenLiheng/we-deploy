import React, { useState } from 'react'
import { Modal, Form, Input, App } from 'antd'
import { useAuthStore } from '@stores/authStore'
import { getErrorMessage } from '@services/serverApi'

const ChangePasswordModal: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  const { message } = App.useApp()
  const changePassword = useAuthStore((s) => s.changePassword)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const handleOk = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await changePassword(values.currentPassword, values.newPassword)
      message.success('密码已修改')
      form.resetFields()
      onClose()
    } catch (err) {
      message.error(getErrorMessage(err, '修改失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="修改密码"
      open={open}
      onOk={handleOk}
      confirmLoading={saving}
      onCancel={() => {
        form.resetFields()
        onClose()
      }}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="currentPassword"
          label="当前密码"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 8, message: '至少 8 位' },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="确认新密码"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator: (_, v) =>
                !v || v === getFieldValue('newPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次输入不一致')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default ChangePasswordModal
