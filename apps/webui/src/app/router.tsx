import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from '@/app/routes';

export const appRouter = createBrowserRouter(routes);

export function AppRouter() {
  return <RouterProvider router={appRouter} />;
}
