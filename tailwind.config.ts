import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          900: "hsl(var(--primary-900))",
          700: "hsl(var(--primary-700))",
          600: "hsl(var(--primary-600))",
          "050": "hsl(var(--primary-050))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          600: "hsl(var(--accent-600))",
          "050": "hsl(var(--accent-050))",
        },
        neutral: {
          900: "hsl(var(--neutral-900))",
          700: "hsl(var(--neutral-700))",
          500: "hsl(var(--neutral-500))",
          300: "hsl(var(--neutral-300))",
          200: "hsl(var(--neutral-200))",
          100: "hsl(var(--neutral-100))",
          "050": "hsl(var(--neutral-050))",
        },
        surface: "hsl(var(--surface))",
        danger: {
          DEFAULT: "hsl(var(--danger-600))",
          600: "hsl(var(--danger-600))",
          "050": "hsl(var(--danger-050))",
        },
        warning: {
          600: "hsl(var(--warning-600))",
          "050": "hsl(var(--warning-050))",
        },
        success: {
          600: "hsl(var(--success-600))",
          "050": "hsl(var(--success-050))",
        },
        info: {
          600: "hsl(var(--info-600))",
          "050": "hsl(var(--info-050))",
        },
        risk: {
          critical: { text: "hsl(var(--risk-critical-text))", bg: "hsl(var(--risk-critical-bg))", border: "hsl(var(--risk-critical-border))" },
          high: { text: "hsl(var(--risk-high-text))", bg: "hsl(var(--risk-high-bg))", border: "hsl(var(--risk-high-border))" },
          medium: { text: "hsl(var(--risk-medium-text))", bg: "hsl(var(--risk-medium-bg))", border: "hsl(var(--risk-medium-border))" },
          low: { text: "hsl(var(--risk-low-text))", bg: "hsl(var(--risk-low-bg))", border: "hsl(var(--risk-low-border))" },
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      spacing: {
        "space-1": "4px",
        "space-2": "8px",
        "space-3": "12px",
        "space-4": "16px",
        "space-5": "20px",
        "space-6": "24px",
        "space-8": "32px",
        "space-10": "40px",
        "space-12": "48px",
        "space-16": "64px",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "radius-sm": "var(--radius-sm)",
        "radius-md": "var(--radius-md)",
        "radius-lg": "var(--radius-lg)",
        "radius-xl": "var(--radius-xl)",
      },
      boxShadow: {
        "sm-token": "var(--shadow-sm)",
        "md-token": "var(--shadow-md)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "spin-slow": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "spin-slow": "spin-slow 2s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
