// dsh-settings ≥0.2 removed settingsNamespace(); settings are now keyed by the
// profile entry id, which the shipped cordis.patch.yml inserts as "free-web-search".
export const FREE_SEARCH_NS = 'free-web-search'
// Entry id used before the rename. Profiles that still carry it keep working;
// the preferred id wins when both entries exist.
export const LEGACY_FREE_SEARCH_NS = 'web-search-free'
export const FREE_SEARCH_NAMESPACES: readonly string[] = [FREE_SEARCH_NS, LEGACY_FREE_SEARCH_NS]

export const ALL_ENGINES = [
  'ddg', 'ddg-lite', 'bing', 'searxng', 'anysearch',
  'exa', 'tavily', 'keenable', 'perplexity', 'deepseek-official',
] as const

export const FREE_ENGINES = ['ddg', 'ddg-lite', 'bing', 'searxng', 'anysearch'] as const

export type EngineId = (typeof ALL_ENGINES)[number]

export interface EngineTestResult {
  ok: true
  sources: Array<{ url: string; title?: string; snippet?: string }>
  truncated: boolean
}

export interface EngineTestFailure {
  ok: false
  error: string
}

export type EngineTestFn = (engine: string, query?: string) => Promise<EngineTestResult | EngineTestFailure>
