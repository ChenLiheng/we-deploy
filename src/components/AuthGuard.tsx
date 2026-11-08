import React, { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuthStore } from '@stores/authStore'

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading, fetchMe } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  if (loading) {
    return (
      <div className="fullscreen-center">
        <Spin size="large" />
      </div>
    )
  }

  if (!token) {
    const from = location.pathname + location.search
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />
  }

  return <>{children}</>
}

export default AuthGuard
