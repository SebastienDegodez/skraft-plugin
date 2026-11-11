const MEMBER_DISCOUNT = 0.1

const round = (amount) => Math.round(amount * 100) / 100

export const priceOf = ({ items, member }) => {
  const total = items.reduce((sum, { price, quantity }) => sum + price * quantity, 0)
  return member === null ? total : round(total * (1 - MEMBER_DISCOUNT))
}
