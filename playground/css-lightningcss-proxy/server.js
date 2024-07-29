import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isTest = process.env.VITEST

const DYNAMIC_STYLES = `
  <style>
  .ssr-proxy {
    color: coral;
  }
  </style>
`

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
    css: {
      transformer: 'lightningcss',
    },
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
  })

  const app = vite.middlewares

  app.use('*', async (req, res, next) => {
    try {
      let [url] = req.originalUrl.split('?')
      if (url.endsWith('/')) url += 'index.html'

      if (url.startsWith('/favicon.ico')) {
        res.status = 404
        return res.end('404')
      }

      const htmlLoc = resolve(`.${url}`)
      let template = fs.readFileSync(htmlLoc, 'utf-8')

      template = template.replace('<!--[inline-css]-->', DYNAMIC_STYLES)

      // Force calling transformIndexHtml with url === '/', to simulate
      // usage by ecosystem that was recommended in the SSR documentation
      // as `const url = req.originalUrl`
      const html = await vite.transformIndexHtml('/', template)

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
