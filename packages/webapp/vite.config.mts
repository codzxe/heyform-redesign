import react from '@vitejs/plugin-react-swc'
import { resolve } from 'path'
import { ConfigEnv, loadEnv } from 'vite'
import svgr from 'vite-plugin-svgr'
import { analyzer } from 'vite-bundle-analyzer'

export default ({ mode }: ConfigEnv) => {
  const env = loadEnv(mode, process.cwd())
  const plugins = [react(), svgr()]

  // Vite >= 5.4.12 only serves requests whose Host header matches its
  // allowlist. Reverse-proxied previews (e.g. cloud sandbox gateways) reach
  // the dev server under an external hostname and are blocked unless it is
  // allowed explicitly:
  //   VITE_ALLOWED_HOSTS=true                 -> allow any host (development only)
  //   VITE_ALLOWED_HOSTS=a.example.com,b.com  -> allow specific hosts
  // Unset keeps Vite's safe defaults (localhost and .localhost subdomains).
  const allowedHostsValue = env.VITE_ALLOWED_HOSTS?.trim()
  const allowedHosts =
    allowedHostsValue === 'true'
      ? true
      : allowedHostsValue
        ? allowedHostsValue
            .split(',')
            .map(host => host.trim())
            .filter(Boolean)
        : undefined

  if (process.env.ANALYZER) {
    plugins.push(analyzer())
  }

  return {
    assetsInclude: ['**/*.svg'],
    plugins,
    define: {
      'import.meta.env.PACKAGE_VERSION': JSON.stringify(process.env.npm_package_version),
      'process.env': {
        VALIDATE_CLIENT_SIDE: true
      }
    },
    resolve: {
      alias: [
        {
          find: /^@myform\/form-renderer\/style\.css$/,
          replacement: resolve(__dirname, '../form-renderer/src/style.scss')
        },
        {
          find: /^@myform\/form-renderer\/src$/,
          replacement: resolve(__dirname, '../form-renderer/src/index.ts')
        },
        {
          find: /^@myform\/form-renderer$/,
          replacement: resolve(__dirname, '../form-renderer/src/index.ts')
        },
        {
          find: '@',
          replacement: resolve(__dirname, './src')
        }
      ]
    },
    build: {
      target: 'es2015',
      // Computing gzip sizes for every chunk is the most memory-hungry phase of
      // the build; disable the report (chunk sizes are still printed).
      reportCompressedSize: false,
      assetsDir: 'static',
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: [
              'react-router-dom',
              'axios',
              'i18next',
              'i18next-browser-languagedetector',
              'react-i18next'
            ],
            ui: [
              '@radix-ui/react-dialog',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
              '@radix-ui/react-toast',
              '@radix-ui/react-tooltip',
              '@radix-ui/react-visually-hidden',
              'react-flow-renderer',
              'react-resizable-panels',
              'react-sortablejs',
              'qrcode.react'
            ],
            myform: [
              '@/lib/router',
              '@myform/answer-utils',
              '@myform/shared-types-enums',
              '@myform/utils'
            ]
          }
        }
      }
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts,
      proxy: {
        '/graphql': {
          target: env.VITE_PROXY_TARGET,
          secure: false,
          changeOrigin: true,
          cookieDomainRewrite: {
            [env.VITE_COOKIE_DOMAIN_REWRITE]: env.VITE_COOKIE_DOMAIN
          },
          
          configure: (proxy: any) => {
            proxy.on('proxyRes', function(proxyRes: any) {
              // [^;]* removes the whole SameSite value: a single [^;] ate one
              // character and corrupted Set-Cookie into "HttpOnlyax".
              const removeSecure = (str: string) => str.replace(/; Secure|; SameSite=[^;]*/gi, '')
              const set = proxyRes.headers['set-cookie']

              if (set) {
                proxyRes.headers['set-cookie'] = Array.isArray(set)
                  ? set.map(removeSecure)
                  : removeSecure(set)
              }
            })
          }
        },
        '/api': {
          target: env.VITE_PROXY_TARGET,
          secure: false,
          changeOrigin: true
        }
      }
    }
  }
}
