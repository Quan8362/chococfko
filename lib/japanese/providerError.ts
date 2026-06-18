// Shared error type for AI/vision/translation providers so API routes can
// distinguish "not configured" (friendly setup message, HTTP 200/501) from a
// genuine runtime failure (HTTP 5xx).

export class ProviderNotConfiguredError extends Error {
  constructor(public readonly provider: string) {
    super(`Provider not configured: ${provider}`)
    this.name = 'ProviderNotConfiguredError'
  }
}

export function isProviderNotConfigured(e: unknown): e is ProviderNotConfiguredError {
  return e instanceof ProviderNotConfiguredError
}
