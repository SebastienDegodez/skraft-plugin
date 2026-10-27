export class InvalidAmount extends Error {
  constructor(amount: number) {
    super(`A payment amount must be positive, got ${amount}`)
  }
}

export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: string,
  ) {}

  static of(amount: number, currency: string): Money {
    if (!Number.isFinite(amount) || amount <= 0) throw new InvalidAmount(amount)
    return new Money(amount, currency.toUpperCase())
  }
}
