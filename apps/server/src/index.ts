import { createServer } from 'node:http'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
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

const PORT = 3001

// Create the room manager and register games
const room_manager = new Room_manager()
room_manager.register_game(shithead_definition as Parameters<typeof room_manager.register_game>[0])

// Create server and attach both Hono and Socket.IO
const http_server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

create_socket_server(http_server as ReturnType<typeof createServer>, room_manager)
