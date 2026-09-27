import type { ReactElement } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { AppBottomNav, AppNav, AppSidebar, OfflineBanner } from '../components/Layout'
import { useAuth } from '../hooks/useAuth'
import { useOnline } from '../hooks/useOnline'

export function ProtectedRoute(): ReactElement {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="loading-block">Checking session...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export function AppLayout(): ReactElement {
  const online = useOnline()

  return (
    <div className="shell shell--app">
      <OfflineBanner online={online} />
      <AppNav />
      <div className="app-frame">
        <AppSidebar />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      <AppBottomNav />
    </div>
  )
}
