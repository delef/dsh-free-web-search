import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import {
  searchDdgHtml,
  searchDdgLite,
  searchBing,
  searchSearxng,
  searchAnysearch,
  searchExa,
  searchExaMCP,
  searchTavily,
  searchKeenable,
  searchPerplexity,
  searchDeepSeekOfficial,
  parseTimeRange,
  approximateTimeRange,
  cleanSnippet,
} from './engines/index.js'
import type { SearchResult, SearchOptions, TimeRange } from './engines/index.js'
import { SearchCache } from './bridge/cache.js'
import { makeBridgeRoutes } from './bridge/routes.js'
import { createAdvancedSearchTool } from './tools/web-search.js'
import { createPlatformSearchTool } from './tools/platform-search.js'
import { createEngineTestTool } from './tools/engine-test.js'
import { createWebFetchTool } from './tools/web-fetch.js'
import { FREE_SEARCH_NS, LEGACY_FREE_SEARCH_NS, ALL_ENGINES } from './constants.js'
import type { EngineId, EngineTestFn, EngineTestResult, EngineTestFailure } from './constants.js'

export { parseTimeRange, approximateTimeRange }
export { FREE_SEARCH_NS, ALL_ENGINES, FREE_ENGINES } from './constants.js'
export type { EngineId, EngineTestFn } from './constants.js'

export const name = 'free-web-search'
export const inject = ['web']

interface PluginConfig {
  provider?: string
  cache?: boolean
  cacheTtl?: number
  lang?: string
  region?: string
  bingMarket?: string
  searxngInstances?: string[]
  platforms?: string[]
  exaApiKey?: string
  tavilyApiKey?: string
  keenableApiKey?: string
  perplexityApiKey?: string
  deepseekApiKey?: string
}

export const Config = z.object({
  provider: z.string().default('bing').volatile(),
  cache: z.boolean().default(true).volatile(),
  cacheTtl: z.number().default(5).volatile(),
  lang: z.string().default('en').volatile(),
  region: z.string().volatile(),
  bingMarket: z.string().default('en-US').volatile(),
  searxngInstances: z.array(z.string()).volatile(),
  platforms: z.array(z.string()).default(['github', 'reddit']).volatile(),
  exaApiKey: z.string().role('secret').volatile(),
  tavilyApiKey: z.string().role('secret').volatile(),
  keenableApiKey: z.string().role('secret').volatile(),
  perplexityApiKey: z.string().role('secret').volatile(),
  deepseekApiKey: z.string().role('secret').volatile(),
})

/** dsh-settings ≥0.2 resolves volatile fields as live refs; dereference on every read. */
function readConfig(cfg: unknown): PluginConfig {
  if (cfg === null || typeof cfg !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(cfg as Record<string, unknown>)) {
    out[key] = value !== null && typeof value === 'object' && typeof (value as { get?: unknown }).get === 'function'
      ? (value as { get: () => unknown }).get()
      : value
  }
  return out as PluginConfig
}

function toSearchOptions(cfg: PluginConfig, timeRange?: TimeRange): SearchOptions {
  return {
    ...(cfg.region ? { region: cfg.region } : {}),
    ...(cfg.bingMarket ? { bingMarket: cfg.bingMarket } : {}),
    ...(cfg.searxngInstances ? { searxngInstances: cfg.searxngInstances } : {}),
    ...(timeRange ? { timeRange } : {}),
  }
}

export function apply(ctx: Context, config?: PluginConfig) {
  let current = (): PluginConfig => readConfig(config)
  // Context services not covered by @deepseek-ai/cordis types
  const ctxAny = ctx as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const logger = ctxAny.logger as { warn(msg: string): void }
  const credentials = ctxAny.get?.('credentials') as
    { resolve(name: string): Promise<{ value?: string }> } | null

  // Profiles created before the entry id rename still work (the settings bridge
  // accepts the legacy id), but they should move to the new id.
  if ((ctxAny.fiber?.entry?.id as string | undefined) === LEGACY_FREE_SEARCH_NS) {
    logger.warn(
      `dsh-free-web-search: the profile entry id "${LEGACY_FREE_SEARCH_NS}" is deprecated; ` +
      `rename it to "${FREE_SEARCH_NS}" (the id in cordis.patch.yml). ` +
      `Settings saved under the old id are kept only until you rename the entry.`,
    )
  }

  let refreshPrompt: (() => void) | null = null

  const searchCache = new SearchCache<SearchResult>()

  const resolveApiKey = async (envName: string, settingsKey?: keyof PluginConfig): Promise<string> => {
    const cfg = current()
    if (settingsKey) {
      const v = cfg[settingsKey]
      if (typeof v === 'string' && v) return v
    }
    if (credentials) {
      try {
        const resolved = await credentials.resolve(envName)
        if (resolved?.value) return resolved.value
      } catch (e) {
        logger.warn(`free-search: credential resolution failed for ${envName}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    return process.env[envName] ?? ''
  }

  const PAID_ENGINES: EngineId[] = ['exa', 'tavily', 'keenable', 'perplexity', 'deepseek-official']
  const SCRAPE_ENGINES: EngineId[] = ['bing', 'anysearch', 'ddg', 'ddg-lite', 'searxng']
  const TIME_ENGINES: EngineId[] = ['tavily', 'exa', 'keenable', 'searxng', 'ddg', 'ddg-lite']

  const provider = {
    id: 'ddg',
    available() { return true },

    async search(request: Record<string, unknown>, signal?: AbortSignal): Promise<SearchResult & { _cache?: string }> {
      if (!request || typeof request.query !== 'string' || !request.query.trim()) {
        throw new Error('query is required')
      }
      const cfg = current()
      const query = request.query
      const preferred: EngineId =
        typeof request.engine === 'string' && (ALL_ENGINES as readonly string[]).includes(request.engine)
          ? request.engine as EngineId
          : (ALL_ENGINES as readonly string[]).includes(cfg.provider ?? '')
            ? cfg.provider as EngineId
            : 'bing'

      const timeRange = parseTimeRange(request.timeRange)
      const timeRangeLabel = typeof request.timeRange === 'string'
        ? request.timeRange
        : timeRange ? ('days' in timeRange ? String(timeRange.days) : timeRange.after) : ''

      const cacheTtlMs = Math.min(Math.max(cfg.cacheTtl ?? 5, 0), 5) * 60 * 1000
      const cacheEnabled = cfg.cache !== false && cacheTtlMs > 0
      const maxResults = Math.max((request.maxResults as number | undefined) ?? 5, 1)
      const cacheKey = cacheEnabled ? searchCache.buildKey(query, maxResults, timeRangeLabel, preferred) : null

      if (cacheKey) {
        const hit = searchCache.get(cacheKey)
        if (hit) {
          if (signal?.aborted) throw new Error('search aborted')
          return { ...hit, sources: hit.sources.slice(), _cache: 'hit' }
        }
      }

      let chain: EngineId[]
      let preferredSkippedReason: string | null = null

      if (timeRange) {
        const preferredFirst = TIME_ENGINES.includes(preferred) ? [preferred] : []
        const otherTime = TIME_ENGINES.filter(e => e !== preferred)
        const noTime = [...PAID_ENGINES, ...SCRAPE_ENGINES].filter(e => !TIME_ENGINES.includes(e) && e !== preferred)
        chain = [...preferredFirst, ...otherTime, ...noTime]
        if (!TIME_ENGINES.includes(preferred)) preferredSkippedReason = 'time-filter'
      } else {
        chain = [preferred, ...PAID_ENGINES.filter(e => e !== preferred), ...SCRAPE_ENGINES.filter(e => e !== preferred)]
      }

      let lastError: Error | null = null
      let preferredFailure: string | null = null
      const BUDGET_MS = 30_000
      const deadline = Date.now() + BUDGET_MS
      const opts = toSearchOptions(cfg, timeRange)

      for (const engine of chain) {
        const remaining = deadline - Date.now()
        if (remaining <= 0) throw new Error(`search timed out after ${BUDGET_MS / 1000}s`)
        const effSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(remaining)])

        try {
          let result = await runEngine(engine, query, maxResults, opts, timeRange, effSignal)

          if (result && result.sources.length > 0) {
            result.sources = result.sources.map(s =>
              s.snippet ? { ...s, snippet: cleanSnippet(s.snippet)! } : s,
            )
            if (engine !== preferred) {
              result.content = preferredSkippedReason === 'time-filter'
                ? `Note: ${preferred} does not support time filtering (timeRange=${timeRangeLabel}), using ${engine}.`
                : `Note: ${preferred} unavailable or failed${preferredFailure ? ` (${preferredFailure})` : ''}, using ${engine}.`
            }
            if (timeRange && !TIME_ENGINES.includes(engine)) {
              const warn = `Warning: ${engine} does not support time filtering — results are unfiltered.`
              result.content = result.content ? `${result.content} ${warn}` : warn
            }
            const cached: SearchResult = { ...result, provider: engine }
            if (cacheKey) {
              const ttl = engine !== preferred ? Math.max(cacheTtlMs / 5, 1000) : cacheTtlMs
              searchCache.set(cacheKey, cached, ttl)
            }
            return { ...cached, _cache: 'miss' }
          }

          lastError = new Error(`engine "${engine}" returned 0 results`)
          if (engine === preferred) preferredFailure = 'returned 0 results'
          logger.warn(`free-search: ${engine} returned 0 results, trying next engine`)
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          if (engine === preferred) preferredFailure = lastError.message
          logger.warn(`free-search: engine "${engine}" failed (${lastError.message}), trying next engine`)
        }
      }
      throw lastError ?? new Error('all search engines failed')
    },
  }

  async function runEngine(
    engine: EngineId, query: string, maxResults: number,
    opts: SearchOptions, timeRange: TimeRange | undefined, signal: AbortSignal,
  ): Promise<SearchResult | null> {
    switch (engine) {
      case 'ddg': return searchDdgHtml(query, maxResults, opts, signal)
      case 'ddg-lite': return searchDdgLite(query, maxResults, opts, signal)
      case 'bing': return searchBing(query, maxResults, opts, signal)
      case 'searxng': return searchSearxng(query, maxResults, opts, signal)
      case 'anysearch': return searchAnysearch(query, maxResults, signal)
      case 'exa': {
        const key = await resolveApiKey('EXA_API_KEY', 'exaApiKey')
        return key
          ? searchExa(query, maxResults, key, timeRange, signal)
          : searchExaMCP(query, maxResults, signal)
      }
      case 'tavily': {
        const key = await resolveApiKey('TAVILY_API_KEY', 'tavilyApiKey')
        return searchTavily(query, maxResults, key, timeRange, signal)
      }
      case 'keenable': {
        const key = await resolveApiKey('KEENABLE_API_KEY', 'keenableApiKey')
        return searchKeenable(query, maxResults, key, timeRange, signal)
      }
      case 'perplexity': {
        const key = await resolveApiKey('PERPLEXITY_API_KEY', 'perplexityApiKey')
        if (!key) { skipEngine(engine, 'PERPLEXITY_API_KEY is not configured'); return null }
        return searchPerplexity(query, maxResults, key, signal)
      }
      case 'deepseek-official': {
        const key = await resolveApiKey('DEEPSEEK_API_KEY', 'deepseekApiKey')
        if (!key) { skipEngine(engine, 'DEEPSEEK_API_KEY is not configured'); return null }
        return searchDeepSeekOfficial(query, maxResults, key, signal)
      }
      default: return null
    }
  }

  function skipEngine(engine: string, reason: string) {
    logger.warn(`free-search: engine "${engine}" skipped (${reason}), trying next engine`)
  }

  const runEngineTest: EngineTestFn = async (engine, query) => {
    const cfg = current()
    const q = query || 'DeepSeek Harness'
    const opts = toSearchOptions(cfg)

    const attempt = async (): Promise<EngineTestResult | EngineTestFailure> => {
      switch (engine) {
        case 'ddg': return { ok: true, ...(await searchDdgHtml(q, 2, opts)), truncated: false }
        case 'ddg-lite': return { ok: true, ...(await searchDdgLite(q, 2, opts)), truncated: false }
        case 'bing': return { ok: true, ...(await searchBing(q, 2, opts)), truncated: false }
        case 'searxng': return { ok: true, ...(await searchSearxng(q, 2, opts)), truncated: false }
        case 'anysearch': return { ok: true, ...(await searchAnysearch(q, 2)), truncated: false }
        case 'exa': {
          const key = await resolveApiKey('EXA_API_KEY', 'exaApiKey')
          return { ok: true, ...(key ? await searchExa(q, 2, key) : await searchExaMCP(q, 2)), truncated: false }
        }
        case 'tavily': {
          const key = await resolveApiKey('TAVILY_API_KEY', 'tavilyApiKey')
          return { ok: true, ...(await searchTavily(q, 2, key)), truncated: false }
        }
        case 'keenable': {
          const key = await resolveApiKey('KEENABLE_API_KEY', 'keenableApiKey')
          return { ok: true, ...(await searchKeenable(q, 2, key)), truncated: false }
        }
        case 'perplexity': {
          const key = await resolveApiKey('PERPLEXITY_API_KEY', 'perplexityApiKey')
          if (!key) return { ok: false, error: 'PERPLEXITY_API_KEY not configured' }
          return { ok: true, ...(await searchPerplexity(q, 2, key)), truncated: false }
        }
        case 'deepseek-official': {
          const key = await resolveApiKey('DEEPSEEK_API_KEY', 'deepseekApiKey')
          if (!key) return { ok: false, error: 'DEEPSEEK_API_KEY not configured' }
          return { ok: true, ...(await searchDeepSeekOfficial(q, 2, key)), truncated: false }
        }
        default: return { ok: false, error: `unknown engine: ${engine}` }
      }
    }

    try {
      const result = await attempt()
      if (!result.ok) return result
      if (result.sources.length === 0) {
        await new Promise(r => setTimeout(r, 1500))
        return attempt()
      }
      return {
        ok: true as const,
        sources: result.sources.map(s =>
          s.snippet ? { ...s, snippet: cleanSnippet(s.snippet)! } : s,
        ),
        truncated: result.truncated,
      }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  }

  // dsh-settings ≥0.2: the settings form is auto-generated from this entry's
  // Config schema (all fields volatile); live edits commit in place and emit
  // loader/volatile-update instead of remounting the plugin.
  ctxAny.on?.('loader/volatile-update', () => { refreshPrompt?.() })

  // The plugin ships its own settings card, so tell Settings not to offer an
  // auto-generated page for this entry.
  ctx.inject(['settings'], (sctx: Context) => {
    sctx.effect(
      () => (sctx as any).settings.configure({ auto: false }, ctxAny.fiber),
      'free-search: custom settings page',
    )
  })

  ctx.inject(['webServer', 'settings'], (sctx: Context) => {
    sctx.effect(() => {
      const disposers = makeBridgeRoutes(
        (sctx as any).settings,
        request => provider.search(request),
        (engine, query) => runEngineTest(engine, query),
      ).map(route => (sctx as any).webServer.register(route))
      return () => { for (const d of disposers) d() }
    }, 'free-search: settings bridge')
  })

  ctxAny.web.registerSearchProvider(provider)

  ctx.inject(['tools'], (sctx: Context) => {
    sctx.effect(() => {
      const d = (sctx as any).tools.register(createEngineTestTool(runEngineTest))
      return () => d()
    }, 'free-search: test engines tool')
  })

  ctx.inject(['tools'], (sctx: Context) => {
    sctx.effect(() => {
      const d = (sctx as any).tools.register(
        createPlatformSearchTool(() => current().platforms ?? ['github', 'reddit']),
      )
      return () => d()
    }, 'free-search: platform search tool')
  })

  ctx.inject(['tools'], (sctx: Context) => {
    sctx.effect(() => {
      const d = (sctx as any).tools.register(createAdvancedSearchTool(provider))
      return () => d()
    }, 'free-search: advanced search tool')
  })

  ctx.inject(['tools'], (sctx: Context) => {
    sctx.effect(() => {
      const d = (sctx as any).tools.register(createWebFetchTool())
      return () => d()
    }, 'free-search: web fetch tool')
  })

  ctx.inject(['systemPrompt'], (sctx: Context) => {
    let disposeSection: (() => void) | null = null
    const sp = (sctx as any).systemPrompt as {
      section(opts: { name: string; order: number; text: string }): () => void
    }

    refreshPrompt = () => {
      if (disposeSection) { disposeSection(); disposeSection = null }
      disposeSection = sp.section({
        name: 'free-search:engines',
        order: 500,
        text: [
          '## Available web search engines (free-web-search plugin)',
          '',
          'You have the web_search tool. Its backend engine is chosen in Settings > Plugins > Free Web Search.',
          `Current engine: ${current().provider ?? 'bing'}`,
          '',
          'Available engines:',
          '- ddg (DuckDuckGo HTML) - FREE, no key',
          '- ddg-lite (DuckDuckGo Lite) - FREE, no key',
          '- bing (Bing) - FREE, no key (most stable)',
          '- searxng (meta-search) - FREE, no key',
          '- anysearch (AI search) - FREE, no key',
          '- exa - FREE keyless (MCP) or EXA_API_KEY',
          '- tavily - FREE keyless or TAVILY_API_KEY',
          '- keenable - FREE keyless (MCP) or KEENABLE_API_KEY',
          '- perplexity - requires PERPLEXITY_API_KEY',
          '- deepseek-official - requires DEEPSEEK_API_KEY',
          '',
          'If the configured engine fails, web_search automatically tries others.',
          '',
          'Use free_search_test to test engine availability.',
          'Use advanced_search with timeRange for time-filtered results.',
          'Use platform_search for GitHub/Reddit searches.',
          'Use web_fetch to read the full content of a single web page (articles, docs, any URL).',
        ].join('\n'),
      })
    }

    sctx.effect(() => {
      refreshPrompt!()
      return () => { if (disposeSection) disposeSection(); disposeSection = null }
    }, 'free-search: engine list prompt section')
  })
}
