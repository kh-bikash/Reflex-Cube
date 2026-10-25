import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, Moon, Settings, Sun, X } from "lucide-react";

import { Logo } from "../brand/Logo";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { cn } from "../../lib/utils";

const NAV_LINKS = [
  { label: "Studio", to: "/generate" },
  { label: "Models", to: "/dashboard" },
  { label: "Cubes", to: "/services" },
  { label: "Docs", to: "/documentation" },
] as const;

/**
 * Application header.
 *
 * Fixed, opaque and the same height on every page. The previous navbar hid
 * itself on scroll down and reappeared on scroll up, which moved the primary
 * navigation out from under the pointer mid-gesture.
 */
export const SiteHeader: React.FC = () => {
  const { user, signOut, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="page flex h-14 items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Link to="/" className="rounded-sm" aria-label="Reflex Cube home">
            <Logo />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          ) : user ? (
            <AccountMenu user={user} onSignOut={signOut} />
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              {/* Links, not buttons: these navigate, and a <button> wrapping an
                  <a> is invalid and breaks middle-click and "open in new tab". */}
              <Link
                to="/signin"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Create account
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="border-t border-border bg-background md:hidden"
        >
          <div className="page flex flex-col py-2">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-2 py-2.5 text-sm",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
            {!user && (
              <div className="mt-2 flex gap-2 border-t border-border pt-3">
                <Link
                  to="/signin"
                  onClick={() => setMenuOpen(false)}
                  className="flex-1 rounded-md border border-border px-3 py-2 text-center text-sm"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMenuOpen(false)}
                  className="flex-1 rounded-md bg-primary px-3 py-2 text-center text-sm text-primary-foreground"
                >
                  Create account
                </Link>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
};

const ThemeToggle: React.FC = () => {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
};

const AccountMenu: React.FC<{
  user: { email: string; display_name: string };
  onSignOut: () => void;
}> = ({ user, onSignOut }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on an outside click or Escape, the way a menu is expected to behave.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initial = (user.display_name || user.email).charAt(0).toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-muted"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
        >
          {initial}
        </span>
        <span className="hidden max-w-32 truncate text-sm text-foreground sm:inline">
          {user.display_name || user.email}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border border-border bg-popover shadow-md"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium text-foreground">
              {user.display_name || "Account"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/settings");
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Settings
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
              navigate("/");
            }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};

export default SiteHeader;
