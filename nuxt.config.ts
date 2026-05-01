// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-04-29',
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@nuxtjs/supabase',
    '@nuxt/image',
    '@vite-pwa/nuxt',
  ],

  css: ['~/assets/css/main.css'],

  typescript: {
    strict: true,
    typeCheck: false,
  },

  /**
   * ハイブリッドレンダリング設定。
   * このアプリは認証必須・データ完全プライベート・将来Capacitor想定なのでSSR不要。
   * routeRules で全アプリ画面を SPA(クライアント側のみレンダー) にしている。
   *
   * 将来LP等の公開ページを作る場合はここにルールを足す:
   *   '/lp/**':       { prerender: true }    // 静的生成
   *   '/blog/**':     { ssr: true }          // SSR
   *   '/og/**':       { ssr: true }          // OGP対応
   */
  routeRules: {
    '/**': { ssr: false },
  },

  app: {
    head: {
      title: 'ヨルリプ',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0f0f10' },
        { name: 'description', content: '夜職向けAI営業LINE文面ジェネレーター' },
      ],
    },
  },

  runtimeConfig: {
    anthropicApiKey: '',
    public: {
      appName: 'ヨルリプ',
    },
  },

  supabase: {
    redirect: false,
    // このアプリは SPA(ssr:false) なので、Supabase セッションは
    // クッキーではなく localStorage に保存させる。
    // クッキー方式だと localhost(http)+secure:true 等の取り回しで
    // F5 ごとにセッションが消えて新しい匿名ユーザーが払い出される事故が起きやすい。
    useSsrCookies: false,
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'ヨルリプ',
      short_name: 'ヨルリプ',
      description: '夜職向けAI営業LINE文面ジェネレーター',
      theme_color: '#0f0f10',
      background_color: '#0f0f10',
      display: 'standalone',
      lang: 'ja',
    },
    workbox: {
      navigateFallback: '/',
    },
    devOptions: {
      enabled: false,
    },
  },
})
