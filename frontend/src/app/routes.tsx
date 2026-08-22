import { createBrowserRouter } from 'react-router'
import { RequireAuth } from '../auth/RequireAuth'
import { AppShell } from '../components/AppShell'
import { SignIn } from '../pages/SignIn'
import { Projects } from '../pages/Projects'
import { ProjectView } from '../pages/ProjectView'
import { SearchPage } from '../pages/SearchPage'
import { VideoWorkspace } from '../pages/VideoWorkspace'

export const router = createBrowserRouter([
  { path: '/signin', element: <SignIn /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Projects /> },
          { path: 'projects/:projectId', element: <ProjectView /> },
          { path: 'projects/:projectId/search', element: <SearchPage /> },
          { path: 'videos/:videoId', element: <VideoWorkspace /> },
        ],
      },
    ],
  },
])
