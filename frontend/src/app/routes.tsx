import { createBrowserRouter } from 'react-router'
import { RequireAuth } from '../auth/RequireAuth'
import { AppShell } from '../components/AppShell'
import { SignIn } from '../pages/SignIn'
import { Projects } from '../pages/Projects'

export const router = createBrowserRouter([
  { path: '/signin', element: <SignIn /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [{ index: true, element: <Projects /> }],
      },
    ],
  },
])
