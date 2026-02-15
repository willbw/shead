import pino from 'pino'

export const logger = pino({
  transport: {
    targets: [
      {
        target: 'pino/file',
        options: { destination: 'game.log', mkdir: true },
      },
      {
        target: 'pino/file',
        options: { destination: 1 }, // stdout
      },
    ],
  },
})
