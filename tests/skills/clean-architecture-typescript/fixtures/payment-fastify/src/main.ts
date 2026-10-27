import { buildServer } from './api/server.js'
import { AuthorizePayment } from './application/payments/authorize-payment.js'
import { HttpPaymentGateway } from './infrastructure/payments/http-payment-gateway.js'

const gateway = new HttpPaymentGateway(process.env.PAYMENT_PROVIDER_BASE_URL ?? 'https://payments.example.invalid')
const server = buildServer({ authorizePayment: new AuthorizePayment(gateway) })

await server.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3000) })
