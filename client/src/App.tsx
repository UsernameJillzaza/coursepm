import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import LoginPage from './auth/LoginPage'
import RequireAuth from './auth/RequireAuth'
import TopBar from './components/TopBar'
import TeamsPage from './teams/TeamsPage'

// SDS §3 route map. Later features add /teams/:teamId and /milestones/:id.
export default function App() {
  return (
    <AuthProvider>
      <TopBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/teams"
          element={
            <RequireAuth>
              <TeamsPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/teams" replace />} />
      </Routes>
    </AuthProvider>
  )
}
