import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import { Room_manager } from '@shead/game-engine'
import { shithead_definition } from '@shead/games'
import type { Base_command } from '@shead/shared'
import { create_socket_server } from './socket'

const app = new Hono()

app.use('*', cors())

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

// Serve the SvelteKit static build in production
const client_path = resolve(import.meta.dirname, '../../client/build')
if (existsSync(client_path)) {
  app.use('/*', serveStatic({ root: client_path }))
  // SPA fallback: serve index.html for any route not matched above
  app.get('*', serveStatic({ root: client_path, path: 'index.html' }))
  console.log(`Serving client from ${client_path}`)
}

const PORT = Number(process.env.PORT) || 3001

// Create the room manager and register games
const room_manager = new Room_manager()
room_manager.register_game(shithead_definition as Parameters<typeof room_manager.register_game>[0])

// Create server and attach both Hono and Socket.IO
const http_server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

create_socket_server(http_server as ReturnType<typeof createServer>, room_manager)
