/**
 * ERP 8Q Enterprise — Tailwind theme extend (UI.1)
 */

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
    micro: [
      "0.625rem",
      { lineHeight: "1.3", letterSpacing: "0.08em", fontWeight: "600" },
    ] as [string, { lineHeight: string; letterSpacing: string; fontWeight: string }],
    label: [
      "0.6875rem",
      { lineHeight: "1.3", letterSpacing: "0.06em", fontWeight: "600" },
    ] as [string, { lineHeight: string; letterSpacing: string; fontWeight: string }],
    "mono-lg": [
      "1.25rem",
      { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" },
    ] as [string, { lineHeight: string; letterSpacing: string; fontWeight: string }],
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
};
