export interface JsonPostOptions {
  timeoutMs?: number
  retries?: number
  fetchImpl?: typeof fetch
}

export class JsonApiError extends Error {
  readonly status?: number
  readonly payload?: unknown

  constructor(message: string, status?: number, payload?: unknown) {
    super(message)
    this.name = 'JsonApiError'
    this.status = status
    this.payload = payload
  }
}

/**
 * POST JSON to a same-origin route, with bounded timeout and a single retry for
 * transient network/server failures. This keeps an intermittent first request
 * from making the assistant or evaluator appear permanently offline.
 */
export async function postJsonWithRetry<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  options: JsonPostOptions = {},
): Promise<{ response: Response; data: T }> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const retries = Math.max(0, Math.min(2, options.retries ?? 1))
  const doFetch = options.fetchImpl ?? fetch
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    let retryable = false

    try {
      const response = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const raw = await response.text()
      let data: any = null
      try { data = raw ? JSON.parse(raw) : null } catch { /* include a useful HTTP error below */ }

      if (!response.ok) {
        const message = String(data?.error || data?.detail || `Request failed (${response.status})`)
        const error = new JsonApiError(message, response.status, data)
        retryable = response.status >= 500
        if (!retryable || attempt === retries) throw error
        lastError = error
      } else if (!data || typeof data !== 'object') {
        throw new JsonApiError('The server returned an invalid response.', response.status)
      } else {
        return { response, data: data as T }
      }
    } catch (error: any) {
      if (error instanceof JsonApiError) {
        if (attempt === retries || !retryable) throw error
        lastError = error
      } else {
        lastError = error
        if (attempt === retries) {
          const message = error?.name === 'AbortError'
            ? 'The request timed out. Please try again.'
            : 'Could not reach the server. Check your connection and try again.'
          throw new JsonApiError(message, undefined, error)
        }
      }
    } finally {
      clearTimeout(timeout)
    }

    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
  }

  throw lastError instanceof Error ? lastError : new JsonApiError('Request failed. Please try again.')
}
