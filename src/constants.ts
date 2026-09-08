export const FREE_SEARCH_NS = 'free-search'

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
