// Calls the pricing service over HTTP.
export function createPricingClient(baseUrl) {
  return {
    async priceOf(sku) {
      const response = await fetch(`${baseUrl}/prices/${encodeURIComponent(sku)}`)
      const { price } = await response.json()
      return price
    },
  }
}
