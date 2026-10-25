import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Github } from "lucide-react";

import { Logo } from "../brand/Logo";
import { Button, Input } from "../ui/primitives";
import { ApiError, newsletter } from "../../lib/api";

const SECTIONS = [
  {
    heading: "Platform",
    links: [
      { label: "Studio", to: "/generate" },
      { label: "Models", to: "/dashboard" },
      { label: "Cubes", to: "/services" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Documentation", to: "/documentation" },
      { label: "API reference", to: "/api-docs" },
      { label: "Changelog", to: "/changelog" },
      { label: "Status", to: "/status" },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "Community", to: "/community" },
      { label: "Support", to: "/support" },
      { label: "Blog", to: "/blog" },
    ],
  },
] as const;

export const SiteFooter: React.FC = () => (
  <footer className="mt-24 border-t border-border bg-surface">
    <div className="page py-14">
      <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            An open-source platform for turning a written description into a trained
            model, and for running task-specific AI tools beside it.
          </p>
          <NewsletterForm />
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {SECTIONS.map((section) => (
            <nav key={section.heading} aria-labelledby={`footer-${section.heading}`}>
              <h2
                id={`footer-${section.heading}`}
                className="text-xs font-semibold uppercase tracking-wider text-foreground"
              >
                {section.heading}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="mt-12 flex flex-col-reverse items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Reflex Cube · Released under the MIT licence
        </p>
        <a
          href="https://github.com/kh-bikash/Reflex-Cube"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Github className="h-4 w-4" aria-hidden="true" />
          Source on GitHub
        </a>
      </div>
    </div>
  </footer>
);

const NewsletterForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setState("sending");
    setMessage(null);
    try {
      const result = await newsletter.subscribe(email.trim());
      setState("done");
      setMessage(
        result.status === "already_subscribed"
          ? "You are already on the list."
          : "Thanks — you are on the list.",
      );
      setEmail("");
    } catch (error) {
      setState("idle");
      setMessage(
        error instanceof ApiError ? error.message : "Could not subscribe. Try again later.",
      );
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 max-w-sm">
      <label htmlFor="footer-email" className="text-xs font-semibold uppercase tracking-wider text-foreground">
        Release notes
      </label>
      <div className="mt-3 flex gap-2">
        <Input
          id="footer-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="flex-1"
        />
        <Button type="submit" variant="secondary" size="md" loading={state === "sending"}>
          Subscribe
        </Button>
      </div>
      {message && (
        <p
          role="status"
          className={`mt-2 text-xs ${state === "done" ? "text-success" : "text-destructive"}`}
        >
          {message}
        </p>
      )}
    </form>
  );
};

export default SiteFooter;
