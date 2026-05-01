import type { Config } from 'tailwindcss'

export default <Partial<Config>>{
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './plugins/**/*.{js,ts}',
    './app.vue',
    './error.vue',
  ],
  theme: {
    extend: {
      colors: {
        // 夜のネオンを意識した暫定パレット。MVP中に調整
        ink: {
          50: '#f6f6f7',
          100: '#e4e4e7',
          400: '#71717a',
          800: '#27272a',
          900: '#18181b',
          950: '#0f0f10',
        },
        accent: {
          DEFAULT: '#ff4d8a',
          soft: '#ffb3c9',
        },
      },
      fontFamily: {
        sans: ['"Hiragino Sans"', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
