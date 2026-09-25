import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { LandingPage } from './pages/LandingPage'
import { LoginPage, SignupPage } from './pages/AuthPages'
import { AppLayout, ProtectedRoute } from './pages/AppLayout'
import { OverviewPage } from './pages/OverviewPage'
import { ResumesPage } from './pages/ResumesPage'
import { JobSpecsPage } from './pages/JobSpecsPage'
import { ComparePage } from './pages/ComparePage'
import { ComparisonDetailPage, HistoryPage } from './pages/HistoryPage'

export default function App(): ReactElement {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="resumes" element={<ResumesPage />} />
              <Route path="job-specs" element={<JobSpecsPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="history/:id" element={<ComparisonDetailPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
