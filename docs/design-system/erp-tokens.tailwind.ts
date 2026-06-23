/**
 * ERP 8Q + Pilar Finance — Design Tokens UI.0
 * Referencia — canonical en lib/design-system/erp-tokens.tailwind.ts
 *
 * Uso:
 *   import { erpThemeExtend } from "./lib/design-system/erp-tokens.tailwind";
 *   theme: { extend: { ...erpThemeExtend } }
 */

export const erpPrimitiveColors = {
  ink: {
    50: "hsl(0 0% 98%)",
    200: "hsl(240 10% 90%)",
    400: "hsl(240 4% 55%)",
    500: "hsl(240 3% 40%)",
    600: "hsl(240 4% 24%)",
    700: "hsl(240 5% 18%)",
    800: "hsl(240 6% 12%)",
    850: "hsl(240 7% 9%)",
    900: "hsl(240 8% 6%)",
    950: "hsl(240 10% 3%)",
  },
  brand: {
    300: "hsl(30 97% 72%)",
    400: "hsl(27 96% 61%)",
    500: "hsl(24 95% 53%)",
    600: "hsl(21 90% 48%)",
    950: "hsl(15 80% 10%)",
  },
  success: { 500: "hsl(152 69% 48%)" },
  warning: { 500: "hsl(38 92% 50%)" },
  danger: { 500: "hsl(0 72% 51%)" },
  info: { 500: "hsl(199 89% 48%)" },
  finance: { 500: "hsl(217 91% 60%)" },
  scnl: { 500: "hsl(280 65% 60%)" },
} as const;

/** Valores HSL sin wrapper — para CSS variables */
export const erpCssVariables = {
  "--erp-bg": "240 10% 3%",
  "--erp-bg-elevated": "240 8% 6%",
  "--erp-bg-card": "240 7% 9%",
  "--erp-bg-hover": "240 6% 12%",
  "--erp-border": "240 4% 24%",
  "--erp-border-subtle": "240 5% 18%",
  "--erp-fg": "240 10% 90%",
  "--erp-fg-muted": "240 4% 55%",
  "--erp-fg-subtle": "240 3% 40%",
  "--erp-accent": "24 95% 53%",
  "--erp-accent-dim": "21 90% 48%",
  "--erp-accent-muted": "30 97% 72%",
  "--erp-ring": "24 95% 53%",
  "--erp-success": "152 69% 48%",
  "--erp-warning": "38 92% 50%",
  "--erp-danger": "0 72% 51%",
  "--erp-info": "199 89% 48%",
  "--erp-finance": "217 91% 60%",
  "--erp-scnl": "280 65% 60%",
  "--erp-sidebar-w": "260px",
  "--erp-sidebar-w-collapsed": "72px",
  "--erp-topbar-h": "64px",
  "--erp-radius-sm": "6px",
  "--erp-radius-md": "8px",
  "--erp-radius-lg": "12px",
  "--erp-radius-xl": "16px",
  "--chart-1": "24 95% 53%",
  "--chart-2": "217 91% 60%",
  "--chart-3": "152 69% 48%",
  "--chart-4": "240 4% 55%",
  "--chart-5": "280 65% 60%",
} as const;

export const erpThemeExtend = {
  colors: {
    erp: {
      bg: "hsl(var(--erp-bg) / <alpha-value>)",
      "bg-elevated": "hsl(var(--erp-bg-elevated) / <alpha-value>)",
      "bg-card": "hsl(var(--erp-bg-card) / <alpha-value>)",
      "bg-hover": "hsl(var(--erp-bg-hover) / <alpha-value>)",
      border: "hsl(var(--erp-border) / <alpha-value>)",
      "border-subtle": "hsl(var(--erp-border-subtle) / <alpha-value>)",
      fg: "hsl(var(--erp-fg) / <alpha-value>)",
      "fg-muted": "hsl(var(--erp-fg-muted) / <alpha-value>)",
      "fg-subtle": "hsl(var(--erp-fg-subtle) / <alpha-value>)",
      accent: "hsl(var(--erp-accent) / <alpha-value>)",
      "accent-dim": "hsl(var(--erp-accent-dim) / <alpha-value>)",
      success: "hsl(var(--erp-success) / <alpha-value>)",
      warning: "hsl(var(--erp-warning) / <alpha-value>)",
      danger: "hsl(var(--erp-danger) / <alpha-value>)",
      info: "hsl(var(--erp-info) / <alpha-value>)",
      finance: "hsl(var(--erp-finance) / <alpha-value>)",
      scnl: "hsl(var(--erp-scnl) / <alpha-value>)",
    },
    chart: {
      1: "hsl(var(--chart-1) / <alpha-value>)",
      2: "hsl(var(--chart-2) / <alpha-value>)",
      3: "hsl(var(--chart-3) / <alpha-value>)",
      4: "hsl(var(--chart-4) / <alpha-value>)",
      5: "hsl(var(--chart-5) / <alpha-value>)",
    },
  },
  fontFamily: {
    sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
    mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
  },
  fontSize: {
    micro: ["0.625rem", { lineHeight: "1.3", letterSpacing: "0.08em", fontWeight: "600" }],
    label: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.06em", fontWeight: "600" }],
    "mono-lg": ["1.25rem", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" }],
  },
  spacing: {
    "erp-sidebar": "var(--erp-sidebar-w)",
    "erp-topbar": "var(--erp-topbar-h)",
  },
  width: {
    "erp-sidebar": "var(--erp-sidebar-w)",
    "erp-sidebar-collapsed": "var(--erp-sidebar-w-collapsed)",
  },
  height: {
    "erp-topbar": "var(--erp-topbar-h)",
    "erp-row": "2.5rem",
    "erp-row-comfortable": "3rem",
  },
  borderRadius: {
    erp: "var(--erp-radius-lg)",
    "erp-sm": "var(--erp-radius-sm)",
    "erp-md": "var(--erp-radius-md)",
    "erp-xl": "var(--erp-radius-xl)",
  },
  boxShadow: {
    "erp-card": "0 0 0 1px hsl(0 0% 100% / 0.03) inset, 0 4px 24px -4px hsl(0 0% 0% / 0.4)",
    "erp-dropdown": "0 8px 32px -8px hsl(0 0% 0% / 0.5)",
    "erp-modal": "0 16px 48px -12px hsl(0 0% 0% / 0.6)",
  },
  transitionDuration: {
    fast: "120ms",
    normal: "200ms",
    slow: "320ms",
  },
  transitionTimingFunction: {
    erp: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  maxWidth: {
    "erp-content": "1440px",
  },
} as const;
