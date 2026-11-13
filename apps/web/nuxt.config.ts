export default defineNuxtConfig({
  compatibilityDate: '2025-11-01',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/main.css', '~/assets/academic-green.css'],
  nitro: {
    devProxy: { '/api': { target: 'http://127.0.0.1:3001/api', changeOrigin: true, ws: true } },
  },
  routeRules: {
    '/**': {
      headers: {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  },
  app: {
    head: {
      title: 'WBS — Universitas Jember',
      meta: [
        { name: 'description', content: 'Portal pelaporan pelanggaran Universitas Jember.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      htmlAttrs: { lang: 'id' },
    },
  },
});
