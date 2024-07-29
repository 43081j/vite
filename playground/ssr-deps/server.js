// @ts-check
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isTest = process.env.VITEST

const noExternal = [
  '@vitejs/test-no-external-cjs',
  '@vitejs/test-import-builtin-cjs',
  '@vitejs/test-no-external-css',
  '@vitejs/test-external-entry',
]

export async function createServer(root = process.cwd(), hmrPort) {
  const resolve = (p) => path.resolve(__dirname, p)

  /**
   * @type {import('vite').ViteDevServer}
   */
  const vite = await (
    await import('vite')
  ).createServer({
    root,
    logLevel: isTest ? 'error' : 'info',
    server: {
      middlewareMode: true,
      watch: {
        // During tests we edit the files too fast and sometimes chokidar
        // misses change events, so enforce polling for consistency
        usePolling: true,
        interval: 100,
      },
      hmr: {
        port: hmrPort,
      },
    },
    appType: 'custom',
    ssr: {
      noExternal,
      external: [
        '@vitejs/test-nested-external',
        '@vitejs/test-external-entry/entry',
      ],
      optimizeDeps: {
        include: noExternal,
      },
    },
    plugins: [
      {
        name: 'dep-virtual',
        enforce: 'pre',
        resolveId(id) {
          if (id === '@vitejs/test-pkg-exports/virtual') {
            return '@vitejs/test-pkg-exports/virtual'
          }
        },
        load(id) {
          if (id === '@vitejs/test-pkg-exports/virtual') {
            return 'export default "[success]"'
          }
        },
      },
      {
        name: 'virtual-isomorphic-module',
        resolveId(id) {
          if (id === 'virtual:isomorphic-module') {
            return '\0virtual:isomorphic-module'
          }
        },
        load(id, { ssr }) {
          if (id === '\0virtual:isomorphic-module') {
            if (ssr) {
              return 'export { default } from "/src/isomorphic-module-server.js";'
            } else {
              return 'export { default } from "/src/isomorphic-module-browser.js";'
            }
          }
        },
      },
    ],
  })
  const app = vite.middlewares

  app.use('*', async (req, res) => {
    try {
      const url = req.originalUrl

      let template
      template = fs.readFileSync(resolve('index.html'), 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      const render = (await vite.ssrLoadModule('/src/app.js')).render

      const appHtml = await render(url, __dirname)

      const html = template.replace(`<!--app-html-->`, appHtml)

      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html')
      res.end(html)
    } catch (e) {
      vite && vite.ssrFixStacktrace(e)
      console.log(e.stack)
      res.statusCode = 500
      res.end(e.stack)
    }
  })

  return { app, vite }
}

if (!isTest) {
  createServer().then(({ app }) =>
    app.listen(5173, () => {
      console.log('http://localhost:5173')
    }),
  )
}
