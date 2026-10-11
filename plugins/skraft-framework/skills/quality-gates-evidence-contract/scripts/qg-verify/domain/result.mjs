// Result type — pure discriminated union, zero deps
export const Ok = (value) => Object.freeze({ ok: true, value })
export const Err = (error) => Object.freeze({ ok: false, error })
export const isOk = (result) => result != null && result.ok === true
export const isErr = (result) => result != null && result.ok === false
