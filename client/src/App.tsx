import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import LoginPage from './auth/LoginPage'
import RequireAuth from './auth/RequireAuth'
import ReleaseFooter from './components/ReleaseFooter'
import TopBar from './components/TopBar'
import TeamDetailPage from './teams/TeamDetailPage'
import TeamsPage from './teams/TeamsPage'
import MilestonePage from './milestones/MilestonePage'
import NewMilestonePage from './milestones/NewMilestonePage'

// SDS §3 route map. F-04 adds the milestone routes.
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
        <Route
          path="/teams/:teamId"
          element={
            <RequireAuth>
              <TeamDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/teams/:teamId/milestones/new"
          element={
            <RequireAuth>
              <NewMilestonePage />
            </RequireAuth>
          }
        />
        <Route
          path="/milestones/:milestoneId"
          element={
            <RequireAuth>
              <MilestonePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/teams" replace />} />
      </Routes>
      <ReleaseFooter />
    </AuthProvider>
  )
}
