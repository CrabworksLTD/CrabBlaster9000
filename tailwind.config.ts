import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1118',
          secondary: '#161822',
          tertiary: '#1e2030'
        },
        border: {
          DEFAULT: '#2a2d3e',
          hover: '#3a3d4e'
        },
        accent: {
          DEFAULT: '#8b5cf6',
          hover: '#7c3aed',
          muted: '#8b5cf620'
        },
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444'
      }
    }
  },
  plugins: []
}

export default config
