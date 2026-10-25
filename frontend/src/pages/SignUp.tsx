import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { LogoMark } from "../components/brand/Logo";
import { Alert, Button, Field, Input } from "../components/ui/primitives";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

const MIN_PASSWORD_LENGTH = 8;

const SignUp: React.FC = () => {
  const { signUp, user, loading, capabilities } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  const registrationClosed = capabilities?.registration_open === false;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    // Checked here as well as server-side so the message appears without a
    // round trip.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signUp(email.trim(), password, displayName.trim() || undefined);
      navigate("/generate", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not create the account. Please try again.",
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
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Create an account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Free. You need one to train models and keep them.
          </p>
        </div>

        {registrationClosed ? (
          <Alert tone="warning" title="Registration is closed">
            This deployment is not accepting new accounts.{" "}
            <Link to="/signin" className="font-medium text-primary hover:underline">
              Sign in
            </Link>{" "}
            if you already have one.
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <Alert tone="error">{error}</Alert>}

            <Field label="Name" htmlFor="name" hint="Optional — how we address you.">
              <Input
                id="name"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Ada Lovelace"
              />
            </Field>

            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(error)}
                placeholder="you@example.com"
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            >
              <Input
                id="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </Field>

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              Create account
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link to="/signin" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignUp;
