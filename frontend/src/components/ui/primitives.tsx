import React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "../../lib/utils";

/*
 * The small set of elements the application screens are built from.
 *
 * Deliberately plain: a hairline border, a flat surface, one accent. The
 * shadcn primitives in `./` remain available for the richer cases (dialogs,
 * popovers, menus); these cover the ninety percent that is a button, a field,
 * a panel or a piece of status.
 */

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
  secondary: "bg-card text-foreground hover:bg-muted border-border",
  ghost: "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted border-transparent",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-transparent",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-[15px] gap-2",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, disabled, className, children, ...props }, ref) => (
    <button
      ref={ref}
      // A spinner alone would let a second click through while the first is
      // still in flight.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-md border",
        "font-medium transition-colors duration-150 ease-standard",
        "disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

const FIELD_BASE =
  "w-full rounded-md border border-input bg-card px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground transition-colors " +
  "focus:border-ring disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-[invalid=true]:border-destructive";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(FIELD_BASE, "h-9", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(FIELD_BASE, "min-h-24 py-2 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(FIELD_BASE, "h-9 pr-8", className)} {...props} />
));
Select.displayName = "Select";

interface FieldProps {
  label: string;
  htmlFor: string;
  /** Guidance shown under the label, before the user makes a mistake. */
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}

/** A labelled form row, with hint and error wired up for screen readers. */
export const Field: React.FC<FieldProps> = ({ label, htmlFor, hint, error, children, className }) => (
  <div className={cn("space-y-1.5", className)}>
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
      {label}
    </label>
    {hint && !error && (
      <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    )}
    {children}
    {error && (
      <p id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive">
        {error}
      </p>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export const Panel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("rounded-lg border border-border bg-card", className)} {...props} />
);

interface PanelHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  description,
  actions,
  className,
}) => (
  <div className={cn("flex items-start justify-between gap-4 border-b border-border px-5 py-4", className)}>
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type StatusTone = "neutral" | "running" | "success" | "error" | "warning";

const STATUS_DOT: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/50",
  running: "bg-info animate-pulse",
  success: "bg-success",
  error: "bg-destructive",
  warning: "bg-warning",
};

/** A labelled status dot. The label carries the meaning; colour reinforces it. */
export const Status: React.FC<{ tone?: StatusTone; children: React.ReactNode; className?: string }> = ({
  tone = "neutral",
  children,
  className,
}) => (
  <span className={cn("status", className)}>
    <span className={cn("status-dot", STATUS_DOT[tone])} aria-hidden="true" />
    {children}
  </span>
);

/** One labelled number, for a row of metrics. */
export const Metric: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}> = ({ label, value, hint, className }) => (
  <div className={cn("min-w-0", className)}>
    <dt className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </dt>
    <dd className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</dd>
    {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
  </div>
);

interface ProgressProps {
  /** 0–100. */
  value: number;
  label?: string;
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({ value, label, className }) => {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="tabular-nums text-foreground">{clamped}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-standard"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

type AlertTone = "info" | "error" | "warning" | "success";

const ALERT_TONE: Record<AlertTone, string> = {
  info: "border-border bg-muted/50 text-foreground",
  error: "border-destructive/30 bg-destructive/5 text-foreground",
  warning: "border-warning/30 bg-warning/5 text-foreground",
  success: "border-success/30 bg-success/5 text-foreground",
};

export const Alert: React.FC<{
  tone?: AlertTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ tone = "info", title, children, className }) => (
  <div
    role={tone === "error" ? "alert" : "status"}
    className={cn("rounded-md border px-4 py-3 text-sm", ALERT_TONE[tone], className)}
  >
    {title && <p className="font-medium">{title}</p>}
    {children && <div className={cn("text-muted-foreground", title && "mt-1")}>{children}</div>}
  </div>
);

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
  icon,
  className,
}) => (
  <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
    {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

/** Placeholder block for content that is still loading. */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("relative overflow-hidden rounded-md bg-muted", className)} aria-hidden="true">
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-background/40 to-transparent" />
  </div>
);

/** Centred spinner for a route or panel that is still resolving. */
export const Spinner: React.FC<{ label?: string; className?: string }> = ({
  label = "Loading",
  className,
}) => (
  <div className={cn("flex items-center justify-center gap-2 py-12 text-muted-foreground", className)}>
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    <span className="text-sm">{label}</span>
  </div>
);
