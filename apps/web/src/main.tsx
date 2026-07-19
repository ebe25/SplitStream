import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { AuthPage, AuthProvider, RequireAuth } from './auth'
import { ExpenseForm } from './pages/ExpenseForm'
import { GroupDetail } from './pages/GroupDetail'
import { Groups } from './pages/Groups'
import { Join } from './pages/Join'
import { Personal } from './pages/Personal'
import { Settings } from './pages/Settings'
import './styles.css'

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex-1 py-3 text-center text-sm transition ${
    isActive ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
  }`

function Shell() {
  return (
    <>
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-zinc-200 bg-white/90 backdrop-blur pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-900/90">
        <NavLink to="/" end className={tab}>Groups</NavLink>
        <NavLink to="/personal" className={tab}>Personal</NavLink>
        <NavLink to="/settings" className={tab}>Settings</NavLink>
      </nav>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route element={<RequireAuth><Shell /></RequireAuth>}>
            <Route path="/" element={<Groups />} />
            <Route path="/group/:id" element={<GroupDetail />} />
            <Route path="/group/:id/expense/new" element={<ExpenseForm />} />
            <Route path="/join/:code" element={<Join />} />
            <Route path="/personal" element={<Personal />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
