/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd2ff',
          300: '#8eb4ff',
          400: '#598bff',
          500: '#3563ff',
          600: '#1f41f5',
          700: '#172fe1',
          800: '#1929b6',
          900: '#1b2a8f',
          950: '#0f1b66'
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d4d9e2',
          300: '#aeb7c8',
          400: '#8290a8',
          500: '#62718c',
          600: '#4d5a73',
          700: '#404a5e',
          800: '#37404f',
          900: '#1f2530',
          950: '#0f141f'
        },
        glass: {
          white: 'rgba(255,255,255,0.7)',
          border: 'rgba(255,255,255,0.2)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0,0,0,0.07), 0 10px 20px -2px rgba(0,0,0,0.04)',
        'glow': '0 0 20px rgba(53,99,255,0.15)',
        'card': '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)',
        'card-hover': '0 10px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
        'modal': '0 25px 60px rgba(0,0,0,0.15)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' }
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        'glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(53,99,255,0.15)' },
          '50%': { boxShadow: '0 0 40px rgba(53,99,255,0.3)' }
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'glow': 'glow 3s ease-in-out infinite',
        'spin-slow': 'spin-slow 8s linear infinite'
      }
    }
  },
  plugins: []
};
