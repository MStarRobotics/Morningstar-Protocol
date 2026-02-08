import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },

    plugins: [
      react(),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        // Node.js polyfills (replacing vite-plugin-node-polyfills to avoid
        // crypto-browserify → elliptic vulnerability chain)
        buffer: 'buffer/',
        stream: 'stream-browserify',
        util: 'util/',
        events: 'events/',
        // Fix @digitalcredentials/open-badges-context: declares ESM entry that doesn't exist
        '@digitalcredentials/open-badges-context': path.resolve(
          __dirname,
          'node_modules/@digitalcredentials/open-badges-context/js/index.js'
        ),
        // Fix @digitalcredentials/dcc-context: declares ESM entry that doesn't exist
        '@digitalcredentials/dcc-context': path.resolve(
          __dirname,
          'node_modules/@digitalcredentials/dcc-context/js/index.js'
        ),
        // Noop stub for @veramo/credential-ld (eliminated to remove elliptic vuln chain)
        '@veramo/credential-ld': path.resolve(
          __dirname,
          'stubs/credential-ld-noop/index.js'
        ),
        // Fix @noble/hashes version conflict: did-jwt needs v1 (sha256 subpath),
        // but @noble/ed25519 v3 installs v2 (sha256 merged into sha2)
        '@noble/hashes/sha256': path.resolve(
          __dirname,
          'node_modules/@noble/hashes/sha2.js'
        ),
        '@noble/hashes/sha512': path.resolve(
          __dirname,
          'node_modules/@noble/hashes/sha2.js'
        ),
      },
    },

    define: {
      'process.env.NODE_DEBUG': JSON.stringify(''),
      'process.env': JSON.stringify({}),
      global: 'globalThis',
    },

    optimizeDeps: {
      include: [
        '@noble/ed25519',
        'buffer',
      ],
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
      },
    },

    build: {
      // Generate source maps so production errors can be traced back to
      // original source files (hidden = maps are not referenced in the
      // bundle itself, keeping them out of browser DevTools for end users).
      sourcemap: isProd ? 'hidden' : true,

      // Raise the warning threshold so known-large chunks do not clutter
      // the build output.  The vendor chunk alone will exceed the default
      // 500 kB; 600 kB gives headroom while still surfacing regressions.
      chunkSizeWarningLimit: 1100,

      rollupOptions: {
        output: {
          // ----- Code-splitting via manual chunks -----
          // Splits heavy third-party packages into their own cache-friendly
          // bundles instead of shipping a single 1.3 MB monolith.
          manualChunks(id: string) {
            // Core framework + router + state (changes rarely)
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'vendor';
            }

            // Recharts + its d3 dependencies (large, used on dashboards)
            if (
              id.includes('node_modules/recharts') ||
              id.includes('node_modules/d3-')
            ) {
              return 'recharts';
            }

            // QR-code generation (only needed on credential views)
            if (id.includes('node_modules/qrcode')) {
              return 'qrcode';
            }

            // PDF generation (only needed for credential export)
            if (
              id.includes('node_modules/jspdf') ||
              id.includes('node_modules/html2canvas')
            ) {
              return 'jspdf';
            }

            // W3C Verifiable Credentials engine (lazy-loaded by credential pages)
            if (
              id.includes('node_modules/@digitalcredentials') ||
              id.includes('node_modules/jsonld') ||
              id.includes('node_modules/credentials-context') ||
              id.includes('node_modules/@noble')
            ) {
              return 'vc-engine';
            }

            // Veramo framework + DID/JWT resolution (lazy-loaded)
            if (
              id.includes('node_modules/@veramo') ||
              id.includes('node_modules/did-jwt') ||
              id.includes('node_modules/did-resolver') ||
              id.includes('node_modules/ethr-did-resolver') ||
              id.includes('node_modules/ethers')
            ) {
              return 'veramo';
            }
          },
        },
      },
    },
  };
});
