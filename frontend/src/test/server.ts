import { setupServer } from 'msw/node'

// Shared MSW server for tests. Individual tests register handlers with
// `server.use(...)`; unhandled requests error so nothing hits the real network.
export const server = setupServer()
