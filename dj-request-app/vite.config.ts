/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Where the built app will be served from.
 *
 * Defaults to the domain root (dev, and any host that serves the app at "/").
 * The GitHub Pages deploy sets DEPLOY_BASE=/turbo-sprint/dj/ because that site
 * root is already taken by an unrelated project.
 */
const base = process.env.DEPLOY_BASE ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        // Must match `base`, or the installed app opens on a blank page.
        start_url: base,
        scope: base,
        name: 'SoundBoard — DJ Song Requests',
        short_name: 'SoundBoard',
        description: 'Request songs from the DJ at your event.',
        theme_color: '#0b0b12',
        background_color: '#0b0b12',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // Never cache Supabase API/realtime traffic — it must always hit the network
        // so that reconnecting after an offline period yields fresh state.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1'),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setupTests.ts'],
    css: false,
    /**
     * The suite tests the app, not the machine it is running on.
     *
     * A developer with a .env pointing at a real Supabase project would
     * otherwise see the peer-to-peer tests fail — those paths only exist when
     * there is no backend, and the app decides that from these very variables.
     * Pinning demo mode here keeps the result the same on a laptop with
     * credentials and one without. Anything that needs the Supabase client
     * builds it explicitly with a stub.
     */
    env: {
      VITE_DEMO_MODE: 'true',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
})
