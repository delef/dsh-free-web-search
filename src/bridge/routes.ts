import type { IncomingMessage, ServerResponse } from 'node:http'
import { SettingsConflictError } from '@deepseek-ai/dsh-settings'
import { FREE_SEARCH_NS } from '../constants.js'
import type { SearchResult, TimeRange } from '../engines/index.js'

export const BRIDGE_PREFIX = '/api/dsh-free-web-search-settings'
const MAX_JSON_BODY_BYTES = 64 * 1024

interface SettingsDescriptor {
  ns: string
  schema: unknown
  value: unknown
  base?: unknown
  user?: unknown
  secrets?: Array<{ path: string[]; set: boolean }>
  revision: number
}

interface SettingsService {
  describe(opts: { redactSecrets: boolean }): SettingsDescriptor[]
  mutate(ns: string, ops: unknown[], expectedRevision?: number): Promise<void>
  writable?: boolean
}

type SearchFn = (request: Record<string, unknown>) => Promise<SearchResult>
type TestEngineFn = (engine: string, query: string, timeRange?: TimeRange) => Promise<
  { ok: true; sources: Array<{ url: string; title?: string; snippet?: string }>; truncated: boolean } |
  { ok: false; error: string }
>

function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

async function readJsonBody(req: IncomingMessage): Promise<unknown | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) {
      req.resume()
      return undefined
    }
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

function toView(descriptor: SettingsDescriptor) {
  return {
    ns: String(descriptor.ns),
    schema: descriptor.schema,
    value: descriptor.value,
    ...(descriptor.base === undefined ? {} : { base: descriptor.base }),
    ...(descriptor.user === undefined ? {} : { user: descriptor.user }),
    ...(descriptor.secrets === undefined
      ? {}
      : { secrets: descriptor.secrets.map((s) => ({ path: [...s.path], set: s.set })) }),
    revision: descriptor.revision,
  }
}

export interface BridgeRoute {
  kind: 'exact'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
}

export function makeBridgeRoutes(
  settings: SettingsService,
  search: SearchFn,
  testEngine: TestEngineFn,
): BridgeRoute[] {
  const allowlisted = () =>
    settings
      .describe({ redactSecrets: true })
      .filter((d) => String(d.ns) === FREE_SEARCH_NS)
      .map((d) => String(d.ns))

  const guard = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'loopback requests only' })
      return false
    }
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'method not allowed: ' + (req.method ?? '') })
      return false
    }
    return true
  }

  const handlers = {
    async describe() {
      const descriptors = settings.describe({ redactSecrets: true })
      return {
        ok: true,
        value: {
          namespaces: allowlisted()
            .map((ns) => descriptors.find((d) => String(d.ns) === ns))
            .filter((d): d is SettingsDescriptor => d !== undefined)
            .map(toView),
          writable: settings.writable !== false,
        },
      }
    },

    async mutate(request: Record<string, unknown>) {
      const body = request
      if (body === null || typeof body !== 'object' || typeof body.ns !== 'string' || !Array.isArray(body.ops)) {
        return { ok: false, code: 'settings-rejected', message: 'malformed bridge settings request' }
      }
      const { ns } = body
      if (!allowlisted().includes(ns)) {
        return { ok: false, code: 'settings-not-exposed', message: `settings namespace "${ns}" is not exposed` }
      }
      const expectedRevision = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined
      try {
        await settings.mutate(ns, body.ops as unknown[], expectedRevision)
      } catch (error) {
        if (error instanceof SettingsConflictError) {
          return { ok: false, code: 'settings-conflict', message: error.message }
        }
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, code: 'internal', message }
      }
      const descriptor = settings.describe({ redactSecrets: true }).find((c) => String(c.ns) === ns)
      if (descriptor === undefined) {
        return { ok: false, code: 'internal', message: `settings namespace "${ns}" was disposed after the mutate` }
      }
      return { ok: true, value: toView(descriptor) }
    },

    async rawSearch(request: Record<string, unknown>) {
      if (request === null || typeof request !== 'object' || typeof request.query !== 'string' || request.query.length === 0) {
        return { ok: false, code: 'search-rejected', message: 'malformed bridge search request (query is required)' }
      }
      if (typeof request.engine === 'string' && request.engine.length > 0) {
        if (typeof testEngine !== 'function') {
          return { ok: false, code: 'search-unavailable', message: 'engine test is not wired' }
        }
        try {
          const result = await testEngine(request.engine, request.query, undefined)
          if (result.ok === false) {
            return { ok: false, code: 'engine-failed', message: result.error ?? `${request.engine} failed` }
          }
          return {
            ok: true,
            value: {
              provider: request.engine,
              sources: result.sources ?? [],
              content: '',
            },
          }
        } catch (error) {
          return { ok: false, code: 'engine-failed', message: error instanceof Error ? error.message : String(error) }
        }
      }
      try {
        const result = await search(request)
        return {
          ok: true,
          value: {
            provider: result.provider ?? (request.engine as string) ?? 'bing',
            sources: result.sources ?? [],
            content: result.content ?? '',
            cache: (result as unknown as Record<string, unknown>)._cache === 'hit' ? 'hit' : 'miss',
          },
        }
      } catch (error) {
        return { ok: false, code: 'search-failed', message: error instanceof Error ? error.message : String(error) }
      }
    },
  }

  return [
    {
      kind: 'exact' as const,
      path: `${BRIDGE_PREFIX}/describe`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        writeJson(res, 200, await handlers.describe())
      },
    },
    {
      kind: 'exact' as const,
      path: `${BRIDGE_PREFIX}/mutate`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { ok: false, code: 'settings-rejected', message: 'malformed JSON body' })
          return
        }
        writeJson(res, 200, await handlers.mutate(body as Record<string, unknown>))
      },
    },
    {
      kind: 'exact' as const,
      path: `${BRIDGE_PREFIX}/raw-search`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { ok: false, code: 'search-rejected', message: 'malformed JSON body' })
          return
        }
        writeJson(res, 200, await handlers.rawSearch(body as Record<string, unknown>))
      },
    },
  ]
}
