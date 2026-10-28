import Fastify from 'fastify'

const server = Fastify()

await server.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3000) })
