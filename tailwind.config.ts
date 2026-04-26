import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        }
      },
      boxShadow: {
        panel: "0 22px 60px rgba(20, 23, 30, 0.08)",
        canvas: "0 30px 80px rgba(28, 43, 27, 0.18)"
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.5rem"
      },
      fontFamily: {
        sans: [
          "\"PingFang SC\"",
          "\"Hiragino Sans GB\"",
          "\"Microsoft YaHei\"",
          "\"Source Han Sans SC\"",
          "sans-serif"
        ],
        display: [
          "\"YouSheBiaoTiHei\"",
          "\"Alibaba PuHuiTi\"",
          "\"PingFang SC\"",
          "sans-serif"
        ]
      },
      keyframes: {
        "fade-up": {
          "0%": {
            opacity: "0",
            transform: "translateY(16px)"
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)"
          }
        },
        "soft-pulse": {
          "0%, 100%": {
            transform: "scale(1)",
            opacity: "1"
          },
          "50%": {
            transform: "scale(1.03)",
            opacity: "0.86"
          }
        }
      },
      animation: {
        "fade-up": "fade-up 480ms ease-out",
        "soft-pulse": "soft-pulse 4s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
