import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  bootstrapStatus,
  currentUser,
  logout,
  setupStatus,
  SubpolarApiError,
  type SubpolarUser
} from '@/lib/subpolar-api'
import { ProviderSetupScreen } from '@/components/ProviderSetupScreen'
import { AuthPage, type AuthMode } from '@/pages/AuthPage'
import NotFoundPage from '@/pages/NotFoundPage'
import SettingsPage from '@/pages/SettingsPage'
import WorkspacePage from '@/pages/WorkspacePage'

export default function SubpolarApp() {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const initialPath = useRef(location.pathname)
  const [user, setUser] = useState<SubpolarUser | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [setupComplete, setSetupComplete] = useState(false)
  const [loading, setLoading] = useState(true)

  const initialize = useEffectEvent(() => {
    return currentUser()
      .then(async result => {
        const setup = await setupStatus()
        setUser(result.user)
        setSetupComplete(setup.complete)
        if (!setup.complete) routerNavigate('/setup', { replace: true })
        else if (initialPath.current === '/login' || initialPath.current.startsWith('/setup'))
          routerNavigate('/chat/new', { replace: true })
      })
      .catch(async reason => {
        if (!(reason instanceof SubpolarApiError) || reason.status !== 401) return
        try {
          setAuthMode((await bootstrapStatus()).required ? 'bootstrap' : 'login')
        } catch {
          setAuthMode('login')
        }
      })
      .finally(() => setLoading(false))
  })

  useEffect(() => {
    void initialize()
  }, [])
  useEffect(() => {
    if (!loading && user === null && location.pathname !== '/login') routerNavigate('/login', { replace: true })
  }, [loading, location.pathname, routerNavigate, user])

  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07191a] text-[#829b92]">
        Loading workspace...
      </main>
    )
  if (!user) {
    return (
      <AuthPage
        mode={authMode}
        onAuthenticated={async authenticated => {
          const setup = await setupStatus()
          setUser(authenticated)
          setSetupComplete(setup.complete)
          routerNavigate(setup.complete ? '/chat/new' : '/setup', { replace: true })
        }}
      />
    )
  }
  if (!setupComplete) {
    return (
      <Routes>
        <Route
          path="/setup/*"
          element={
            <ProviderSetupScreen
              onComplete={() => {
                setSetupComplete(true)
                routerNavigate('/chat/new', { replace: true })
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )
  }

  const onLogout = () => {
    void logout().finally(() => {
      setUser(null)
      routerNavigate('/login', { replace: true })
    })
  }

  const workspace = <WorkspacePage user={user} onLogout={onLogout} />
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chat/new" replace />} />
      <Route path="/chat/new" element={workspace} />
      <Route path="/chat/:sessionId" element={workspace} />
      <Route path="/projects" element={workspace} />
      <Route path="/projects/new" element={workspace} />
      <Route path="/projects/:projectId" element={workspace} />
      <Route path="/projects/:projectId/agents/new" element={workspace} />
      <Route path="/agents" element={workspace} />
      <Route path="/agents/:agentId" element={workspace} />
      <Route path="/automations" element={workspace} />
      <Route path="/automations/:automationId" element={workspace} />
      <Route path="/apps" element={workspace} />
      <Route path="/settings" element={<Navigate to="/settings/user/account" replace />} />
      <Route path="/settings/account" element={<Navigate to="/settings/user/account" replace />} />
      <Route path="/settings/appearance" element={<Navigate to="/settings/user/appearance" replace />} />
      <Route path="/settings/providers" element={<Navigate to="/settings/agent/models/providers" replace />} />
      <Route
        path="/settings/agent/models/providers/configure"
        element={<ProviderSetupScreen editing onComplete={() => routerNavigate('/settings/agent/models/providers')} />}
      />
      <Route path="/settings/*" element={<SettingsPage user={user} onLogout={onLogout} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
