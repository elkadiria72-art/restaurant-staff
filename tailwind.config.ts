import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      colors: {
        ivory: {
          50: '#FCFAF6',
          100: '#F8F4EC',
          200: '#F2ECE0',
          300: '#E9E1D0',
        },
        gold: {
          50: '#FBF6EA',
          100: '#F6ECD2',
          200: '#EFDAA9',
          300: '#E4C478',
          400: '#D6AC52',
          500: '#C6963A',
          600: '#AD7C2B',
          700: '#8C6322',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(72, 60, 38, 0.05), 0 2px 8px -2px rgba(72, 60, 38, 0.06)',
        card: '0 1px 2px rgba(72, 60, 38, 0.04), 0 6px 20px -8px rgba(72, 60, 38, 0.10)',
        'card-hover': '0 2px 4px rgba(72, 60, 38, 0.05), 0 14px 32px -10px rgba(72, 60, 38, 0.16)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.96) translateY(6px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'glow-soft': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(198, 150, 58, 0)' },
          '50%': { boxShadow: '0 0 0 5px rgba(198, 150, 58, 0.16)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'rise-in': 'rise-in 0.35s cubic-bezier(0.21, 1.02, 0.73, 1) both',
        'pop-in': 'pop-in 0.3s cubic-bezier(0.21, 1.02, 0.73, 1) both',
        'glow-soft': 'glow-soft 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
