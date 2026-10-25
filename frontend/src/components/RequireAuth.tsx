import React from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Spinner } from "./ui/primitives";
import { useAuth } from "../lib/auth";

/**
 * Gate for routes that need an account.
 *
 * Deployments can run with `REQUIRE_AUTH=0` (a single-user local install), so
 * the gate consults the server's own answer rather than assuming. While the
 * stored token is still being checked it renders a spinner — redirecting first
 * would bounce a signed-in user to the sign-in page on every reload.
 */
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, capabilities } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session" />;

  const authRequired = capabilities?.auth_required ?? true;
  if (authRequired && !user) {
    return <Navigate to="/signin" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
