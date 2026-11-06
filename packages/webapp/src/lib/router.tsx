import { FC, ReactNode } from 'react'
import { BrowserRouter, Navigate, RouteObject, useLocation, useRoutes } from 'react-router-dom'

export interface RouteOptions {
  title?: string
  loginRequired?: boolean
  redirectIfLogged?: boolean
  isHomePage?: boolean
  projectShell?: boolean
  formShell?: boolean
  className?: string
  [key: string]: any
}

export interface Route {
  path: string
  component: FC<any> | (() => ReactNode)
  layout?: FC<LayoutProps>
  options?: RouteOptions
}

export interface LayoutProps {
  options?: RouteOptions
  children?: ReactNode
}

export type RouteRenderFunction = (options?: RouteOptions, children?: ReactNode) => ReactNode

interface RouterProps {
  routes: Route[]
  render?: RouteRenderFunction
}

interface GuardedRouteProps {
  route: Route
  render?: RouteRenderFunction
}

/**
 * Renders one matched route through the guard callback.
 *
 * The guard decision must be re-evaluated on every navigation, because it
 * depends on mutable state (login cookies) that can change without the route
 * table changing. This component subscribes to the router location so it
 * re-renders on each navigation, and builds its element tree fresh at that
 * point - never memoized - so a user who just logged in is never served a
 * stale <Navigate to="/login"/> that was computed while they were logged out.
 */
const GuardedRoute: FC<GuardedRouteProps> = ({ route, render }) => {
  // Subscribe to location changes: guarantees a re-render on every navigation
  // even if the parent bails out on a referentially identical element.
  useLocation()

  const { component: Component, layout: Layout, options } = route
  const page = <Component />

  const wrapped =
    Layout !== undefined && Layout !== null ? <Layout options={options}>{page}</Layout> : page

  const guarded = render ? render(options, wrapped) : undefined

  return <>{guarded === undefined || guarded === null ? wrapped : guarded}</>
}

/**
 * Renders the route tree with react-router's useRoutes.
 *
 * Each route maps to a route object whose element defers to <GuardedRoute>,
 * which runs the caller's render hook for the matched route only. The hook
 * decides guard outcomes: it may return a redirect (<Navigate />), the
 * children it was given, or nothing at all when the guards pass - in which
 * case the wrapped page is rendered unchanged.
 */
const RouteTree: FC<RouterProps> = ({ routes, render }) => {
  const routeObjects: RouteObject[] = routes.map(route => ({
    path: route.path,
    element: <GuardedRoute route={route} render={render} />
  }))

  // Unknown paths fall back to the home route instead of a blank screen.
  routeObjects.push({
    path: '*',
    element: <Navigate to="/" replace />
  })

  return useRoutes(routeObjects)
}

/**
 * Declarative route table renderer.
 *
 * <Router routes={routes} render={render} /> mounts a BrowserRouter and
 * renders the given route table. The render hook runs per matched route on
 * every navigation and owns the auth decisions (loginRequired /
 * redirectIfLogged), keeping guard logic in one place in main.tsx.
 */
const Router: FC<RouterProps> = ({ routes, render }) => (
  <BrowserRouter>
    <RouteTree routes={routes} render={render} />
  </BrowserRouter>
)

export default Router
