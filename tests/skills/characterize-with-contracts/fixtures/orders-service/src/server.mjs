import { createServer } from 'node:http'
import { createApp } from './app.mjs'
import { createPricingClient } from './pricing-client.mjs'

const pricing = createPricingClient(process.env.PRICING_URL ?? 'http://localhost:8081')
createServer(createApp({ pricing })).listen(Number(process.env.PORT ?? 8080))
