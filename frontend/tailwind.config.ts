import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

/**
 * Every colour here reads a CSS variable defined in `src/index.css`, so the
 * light and dark themes stay in one place.
 *
 * The previous config referenced `--primary-glow`, `--ai-*` and `--sidebar-*`,
 * none of which existed, and set `font-sans` to Open Sans and `font-display`
 * to Poppins while the stylesheet only loaded Inter — so both resolved to the
 * browser's generic fallback.
 */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1200px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        surface: "hsl(var(--surface))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },
      fontFamily: {
        // Inter for everything, IBM Plex Mono for ids, metrics and logs. Both
        // are loaded in index.css; the stack after each is the system fallback
        // used before the webfont arrives.
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // A display step above Tailwind's defaults, with the tight tracking
        // large Inter needs.
        display: ["clamp(2.5rem, 1.5rem + 3.2vw, 4rem)", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        title: ["clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem)", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        // Restrained elevation: a hairline plus a short, soft drop. Nothing
        // here should read as a floating card.
        xs: "0 1px 2px 0 hsl(222 24% 11% / 0.04)",
        sm: "0 1px 3px 0 hsl(222 24% 11% / 0.06), 0 1px 2px -1px hsl(222 24% 11% / 0.04)",
        md: "0 4px 12px -2px hsl(222 24% 11% / 0.08), 0 2px 4px -2px hsl(222 24% 11% / 0.04)",
        lg: "0 12px 32px -8px hsl(222 24% 11% / 0.12)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        // Motion is for orientation, not ornament: short, once, and never
        // competing with the content.
        "fade-in": "fade-in 0.25s ease-out",
        shimmer: "shimmer 1.6s infinite",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
} satisfies Config;
