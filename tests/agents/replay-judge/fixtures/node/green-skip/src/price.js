const MEMBER_DISCOUNT = 0.1

const round = (amount) => Math.round(amount * 100) / 100

const isDiscounted = (member) => member !== null && member.status !== 'cancelled'

export const priceOf = ({ items, member }) => {
  const total = items.reduce((sum, { price, quantity }) => sum + price * quantity, 0)
  return isDiscounted(member) ? round(total * (1 - MEMBER_DISCOUNT)) : total
}
