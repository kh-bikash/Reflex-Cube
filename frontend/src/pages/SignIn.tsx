import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { LogoMark } from "../components/brand/Logo";
import { Alert, Button, Field, Input } from "../components/ui/primitives";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

/** Where to send the user after signing in, when a guard redirected them here. */
interface LocationState {
  from?: string;
}

const SignIn: React.FC = () => {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const destination = (location.state as LocationState | null)?.from ?? "/dashboard";

  if (!loading && user) return <Navigate to={destination} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate(destination, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not sign in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <LogoMark className="mx-auto h-8 w-8 text-primary" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your models and training history live in your account.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}

          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(error)}
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(error)}
            />
          </Field>

          <Button type="submit" size="lg" loading={submitting} className="w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignIn;
