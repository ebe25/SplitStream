import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { PageFade } from './anim'
import { AuthPage, AuthProvider, RequireAuth } from './auth'
import { InstallBanner } from './install'
import { ExpenseForm } from './pages/ExpenseForm'
import { GroupDetail } from './pages/GroupDetail'
import { Groups } from './pages/Groups'
import { Inbox } from './pages/Inbox'
import { Join } from './pages/Join'
import { Personal } from './pages/Personal'
import { Settings } from './pages/Settings'
import { SplitPending } from './pages/SplitPending'
import '@fontsource-variable/anek-latin'
import './styles.css'

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex-1 border-t-2 py-3 text-center text-sm transition ${
    isActive ? 'border-pine font-semibold text-accent' : 'border-transparent text-muted hover:text-ink'
  }`

function Shell() {
  const { pathname } = useLocation()
  return (
    <>
      <PageFade key={pathname}>
        <Outlet />
      </PageFade>
      <InstallBanner />
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-line bg-surface/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <NavLink to="/" end className={tab}>Groups</NavLink>
        <NavLink to="/personal" className={tab}>Personal</NavLink>
        <NavLink to="/inbox" className={tab}>Inbox</NavLink>
        <NavLink to="/settings" className={tab}>Settings</NavLink>
      </nav>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <MotionConfig reducedMotion="user">
        <Routes>
          <Route path="/auth" element={<PageFade><AuthPage /></PageFade>} />
          <Route element={<RequireAuth><Shell /></RequireAuth>}>
            <Route path="/" element={<Groups />} />
            <Route path="/group/:id" element={<GroupDetail />} />
            <Route path="/group/:id/expense/new" element={<ExpenseForm />} />
            <Route path="/group/:id/split/:eid" element={<SplitPending />} />
            <Route path="/join/:code" element={<Join />} />
            <Route path="/personal" element={<Personal />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
        </MotionConfig>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
