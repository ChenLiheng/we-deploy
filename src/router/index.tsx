import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from '@components/Layout/MainLayout'
import AuthGuard from '@components/AuthGuard'
import Login from '@components/Login'
import Dashboard from '@components/Dashboard'
import Iterations from '@components/Iterations'
import Projects from '@components/Projects'
import ProjectConfig from '@components/ProjectConfig'
import BuildHistory from '@components/BuildHistory'
import BuildConsole from '@components/BuildConsole'
import Settings from '@components/Settings'

const AppRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <AuthGuard>
            <MainLayout />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="iterations" element={<Iterations />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:projectId/config" element={<ProjectConfig />} />
        <Route path="builds" element={<BuildHistory />} />
        <Route path="projects/:projectId/builds/:buildId" element={<BuildConsole />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

export default AppRouter
