import { Suspense, lazy } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import Home from "../pages/Home";
import { RequireAuth } from "./RequireAuth";
import { Spinner } from "./ui/primitives";

// Route-level code splitting: the landing page ships in the initial bundle,
// everything else is fetched on navigation.
const NotFound = lazy(() => import("../pages/NotFound"));
const Studio = lazy(() => import("../pages/Studio"));
const Models = lazy(() => import("../pages/Models"));
const Cubes = lazy(() => import("../pages/Cubes"));
const CubePage = lazy(() => import("../pages/CubePage"));
const DocsTemplate = lazy(() => import("../pages/DocsTemplate"));
const SignIn = lazy(() => import("../pages/SignIn"));
const SignUp = lazy(() => import("../pages/SignUp"));
const Settings = lazy(() => import("../pages/Settings"));

/** Content routes that all render the same documentation shell. */
const DOC_ROUTES = [
  "/api-docs",
  "/changelog",
  "/documentation",
  "/blog",
  "/community",
  "/support",
  "/status",
] as const;

export const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <Suspense fallback={<Spinner className="min-h-[60vh]" />}>
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/services" element={<Cubes />} />

        {DOC_ROUTES.map((path) => (
          <Route key={path} path={path} element={<DocsTemplate />} />
        ))}

        {/* Everything below spends server resources or shows private data. */}
        <Route
          path="/generate"
          element={
            <RequireAuth>
              <Studio />
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Models />
            </RequireAuth>
          }
        />
        <Route
          path="/cube/:id"
          element={
            <RequireAuth>
              <CubePage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

export default AnimatedRoutes;
