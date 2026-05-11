import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0d1426',
        muted: '#5b6478',
        faint: '#9ba3b4',
        blue: '#3b6dff',
        violet: '#7a4dff',
        'glass-bg': 'rgba(255,255,255,0.65)',
        'glass-border': 'rgba(255,255,255,0.9)',
        'glass-line': 'rgba(13,20,38,0.08)',
        'page-bg': '#eef1f7',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-noto)', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.8) inset, 0 8px 24px rgba(13,20,38,0.06)',
        frame: '0 30px 80px rgba(13,20,38,0.18), 0 6px 18px rgba(13,20,38,0.08)',
        'btn-primary': '0 6px 18px rgba(59,109,255,0.32)',
        'dot-glow': '0 0 6px #3b6dff',
      },
    },
  },
  plugins: [],
};

export default config;
