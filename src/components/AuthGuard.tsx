import React, { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@stores/authStore'
import { Spin } from 'antd'

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading, fetchMe } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  // Still loading initial auth check
  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0d1117',
        }}
      >
        <Spin size="large" />
      </div>
    )
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

export default AuthGuard
