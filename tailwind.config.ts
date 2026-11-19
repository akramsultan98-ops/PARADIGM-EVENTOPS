import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/** All colours resolve to CSS variables defined in src/app/globals.css (design tokens). */
const v = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      colors: {
        border: v("border"),
        input: v("input"),
        ring: v("ring"),
        background: v("background"),
        foreground: v("foreground"),
        surface: v("surface"),
        primary: { DEFAULT: v("primary"), foreground: v("primary-foreground") },
        secondary: { DEFAULT: v("secondary"), foreground: v("secondary-foreground") },
        muted: { DEFAULT: v("muted"), foreground: v("muted-foreground") },
        accent: { DEFAULT: v("accent"), foreground: v("accent-foreground") },
        card: { DEFAULT: v("card"), foreground: v("card-foreground") },
        popover: { DEFAULT: v("popover"), foreground: v("popover-foreground") },
        destructive: { DEFAULT: v("destructive"), foreground: v("destructive-foreground") },
        success: { DEFAULT: v("success"), soft: v("success-soft") },
        warning: { DEFAULT: v("warning"), soft: v("warning-soft") },
        danger: { DEFAULT: v("danger"), soft: v("danger-soft") },
        info: { DEFAULT: v("info"), soft: v("info-soft") },
        violet: { DEFAULT: v("violet"), soft: v("violet-soft") },
        brand: {
          navy: v("brand-navy"),
          "navy-deep": v("brand-navy-deep"),
          "navy-mid": v("brand-navy-mid"),
          "navy-light": v("brand-navy-light"),
          cyan: v("brand-cyan"),
          "cyan-light": v("brand-cyan-light"),
          "cyan-pale": v("brand-cyan-pale"),
        },
        sidebar: { DEFAULT: v("sidebar"), foreground: v("sidebar-foreground"), muted: v("sidebar-muted"), active: v("sidebar-active"), border: v("sidebar-border") },
        chart: { 1: v("chart-1"), 2: v("chart-2"), 3: v("chart-3"), 4: v("chart-4"), 5: v("chart-5"), 6: v("chart-6") },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "var(--font-arabic)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-arabic)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: { "2xs": ["0.6875rem", { lineHeight: "1rem" }] },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)", xl: "calc(var(--radius) + 4px)" },
      boxShadow: {
        card: "0 1px 2px 0 rgb(6 21 32 / 0.04), 0 1px 3px 0 rgb(6 21 32 / 0.06)",
        raised: "0 4px 16px -4px rgb(6 21 32 / 0.12)",
        focus: "0 0 0 3px hsl(var(--ring) / 0.25)",
      },
      keyframes: { "fade-in": { from: { opacity: "0", transform: "translateY(2px)" }, to: { opacity: "1", transform: "none" } } },
      animation: { "fade-in": "fade-in 160ms ease-out" },
    },
  },
  plugins: [animate],
} satisfies Config;
