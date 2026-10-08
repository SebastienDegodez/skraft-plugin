import type { PropsWithChildren } from 'react'

type ErrorMessageProps = PropsWithChildren

export const ErrorMessage = ({ children }: ErrorMessageProps) => <p role="alert">{children}</p>
