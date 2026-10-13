import { useState, useCallback, useEffect } from 'react'

const BRIDGE_PREFIX = '/api/dsh-free-web-search-settings'
// Settings ns = the profile entry id inserted by cordis.patch.yml.
const NS = 'web-search-free'

const CSS = [
  '.dshfs-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;min-width:0;list-style:none;transition:border-color .16s,background .16s;overflow:hidden;margin-bottom:8px}',
  '.dshfs-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
  '.dshfs-header{width:100%;color:inherit;cursor:pointer;text-align:left;font:inherit;background:0 0;border:0;align-items:center;gap:8px;padding:10px 14px;display:flex}',
  '.dshfs-header:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
  '.dshfs-headText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex;overflow:hidden}',
  '.dshfs-name{color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;font-weight:600;overflow:hidden}',
  '.dshfs-description{color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;font-size:12px;overflow:hidden}',
  '.dshfs-pending{color:var(--dsw-alias-state-warn-primary);white-space:nowrap;flex:none;font-size:12px}',
  '.dshfs-chevron{color:var(--dsw-alias-label-tertiary);flex:none;font-size:13px;transition:transform .12s}',
  '.dshfs-chevronOpen{transform:rotate(180deg)}',
  '.dshfs-body{flex-direction:column;gap:14px;padding:0 14px 14px;display:flex}',
  '.dshfs-footer{justify-content:space-between;align-items:center;gap:8px;display:flex;flex-wrap:wrap}',
  '.dshfs-footerLeft{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}',
  '.dshfs-footerRight{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '.dshfs-failed{color:var(--dsw-alias-state-error-primary);font-size:12px}',
  '.dshfs-testOk{color:#7ddb9c;font-size:12px;line-height:1.5}',
  '.dshfs-resultRow{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;margin-top:2px}',
  '.dshfs-field{flex-direction:column;gap:4px;min-width:0;display:flex}',
  '.dshfs-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500}',
  '.dshfs-select{border:1px solid var(--dsw-alias-border-l2);font:inherit;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border-radius:6px;padding:6px 8px;font-size:13px;transition:border-color .13s,box-shadow .13s;width:100%}',
  '.dshfs-select:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}',
  '.dshfs-input{border:1px solid var(--dsw-alias-border-l2);font:inherit;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border-radius:6px;padding:6px 8px;font-size:13px;transition:border-color .13s,box-shadow .13s;width:100%}',
  '.dshfs-ttl{width:88px}',
  '.dshfs-input:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}',
  '.dshfs-input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
  '.dshfs-input:disabled{opacity:.6;cursor:default}',
  '.dshfs-hint{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px}',
  '.dshfs-platforms{display:flex;gap:10px;flex-wrap:wrap}',
  '.dshfs-platform{display:flex;align-items:center;gap:5px;color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer}',
  '.dshfs-platform input{accent-color:var(--dsw-alias-state-business-primary)}',
  '.dshfs-link{color:var(--dsw-alias-state-business-primary);font-size:12px;text-decoration:none;align-self:flex-start;padding:2px 0}',
  '.dshfs-link:hover{text-decoration:underline}',
  '.dshfs-btn{font:inherit;cursor:pointer;border-radius:6px;padding:5px 12px;font-size:13px;transition:background-color .13s,border-color .13s,color .13s}',
  '.dshfs-save{border:1px solid var(--dsw-alias-button-info-fill);background:var(--dsw-alias-button-info-fill);color:var(--dsw-alias-label-primary-foreground)}',
  '.dshfs-save:hover:not(:disabled){border-color:var(--dsw-alias-button-info-hover);background:var(--dsw-alias-button-info-hover)}',
  '.dshfs-save:disabled{opacity:.5;cursor:default}',
  '.dshfs-badge{background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-state-business-primary);white-space:nowrap;border-radius:999px;flex:none;padding:1px 6px;font-size:11px}',
  '.dshfs-badgeFree{background:rgba(80,200,120,.15);color:#7ddb9c;border:1px solid rgba(80,200,120,.3);white-space:nowrap;border-radius:999px;flex:none;padding:1px 6px;font-size:11px}',
  '.dshfs-badgeKey{background:rgba(240,170,80,.15);color:#f0b060;border:1px solid rgba(240,170,80,.3);white-space:nowrap;border-radius:999px;flex:none;padding:1px 6px;font-size:11px}',
  '.dshfs-langToggle{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:transparent;flex:none;padding:2px 8px;font-size:11px;border-radius:6px}',
  '.dshfs-version{color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}',
].join('')

const TAG_ID = 'dsh-free-web-search/card.css'

if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css=${JSON.stringify(TAG_ID)}]`) === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-free-web-search'
  tag.dataset.pluginCss = TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

interface EngineEntry {
  id: string
  label: string
  badge: 'FREE' | 'API KEY'
  link: string
}

const ENGINES: EngineEntry[] = [
  { id: 'ddg', label: 'DuckDuckGo · HTML', badge: 'FREE', link: 'https://duckduckgo.com' },
  { id: 'ddg-lite', label: 'DuckDuckGo · Lite', badge: 'FREE', link: 'https://duckduckgo.com' },
  { id: 'bing', label: 'Bing', badge: 'FREE', link: 'https://www.bing.com' },
  { id: 'anysearch', label: 'AnySearch · AI', badge: 'FREE', link: 'https://anysearch.com' },
  { id: 'searxng', label: 'SearXNG', badge: 'FREE', link: 'https://github.com/searxng/searxng' },
  { id: 'exa', label: 'Exa', badge: 'FREE', link: 'https://dashboard.exa.ai/api-keys' },
  { id: 'tavily', label: 'Tavily', badge: 'FREE', link: 'https://app.tavily.com/home' },
  { id: 'keenable', label: 'Keenable', badge: 'FREE', link: 'https://keenable.ai/login' },
  { id: 'perplexity', label: 'Perplexity', badge: 'API KEY', link: 'https://www.perplexity.ai/settings/api' },
  { id: 'deepseek-official', label: 'DeepSeek Official', badge: 'API KEY', link: 'https://platform.deepseek.com/api_keys' },
]

interface BridgeResponse<T = unknown> {
  ok: boolean
  value?: T
  message?: string
}

interface SettingsView {
  ns: string
  value?: Record<string, unknown>
  secrets?: Array<{ path: string[]; set: boolean }>
}

interface DescribeResult {
  namespaces: SettingsView[]
  writable: boolean
}

interface TestResultOk {
  ok: true
  count: number
  engine: string
  content: string
  sample: string
}

interface TestResultFail {
  ok: false
  error: string
}

type TestResult = TestResultOk | TestResultFail

type Lang = 'en' | 'zh'

const I18N = {
  zh: {
    description: '免费搜索 —— 无需 API key（Bing / DuckDuckGo / AnySearch / Exa / Tavily / Keenable）',
    unsaved: '未保存',
    searchEngine: '搜索引擎',
    visit: '访问官网 →',
    getKey: '获取 API Key →',
    engineHint: 'Bing 是最稳定的免费引擎。DuckDuckGo 在共享 IP 上可能限流。API KEY 引擎需在下方填写凭据。',
    apiKeys: 'API 密钥（可选）',
    exaPh: (c: boolean) => c ? 'Exa API 密钥（已配置）' : 'Exa API 密钥（可选）',
    tavilyPh: (c: boolean) => c ? 'Tavily API 密钥（已配置）' : 'Tavily API 密钥（可选）',
    keenablePh: (c: boolean) => c ? 'Keenable API 密钥（已配置）' : 'Keenable API 密钥（可选）',
    perplexityPh: (c: boolean) => c ? 'Perplexity API 密钥（已配置）' : 'Perplexity API 密钥（pplx-...）',
    deepseekPh: (c: boolean) => c ? 'DeepSeek API 密钥（已配置）' : 'DeepSeek API 密钥（sk-...）',
    keysHint: '密钥保存在 settings.yaml（界面脱敏显示）。为某引擎填写密钥后即可使用。',
    platformSearch: '平台搜索（platform_search 工具）',
    platformHint: '为 agent 的 platform_search 工具启用平台。禁用的平台会被跳过。',
    cacheTtl: '结果缓存时长（分钟）',
    cacheTtlHint: '0 关闭缓存，最长 5 分钟。',
    unavailable: '设置不可用',
    saveFailed: '保存失败',
    testing: '测试中…',
    testEngine: '测试引擎',
    useBing: '恢复 Bing 默认',
    discard: '撤销',
    saving: '保存中…',
    save: '保存',
    testOk: (r: TestResultOk) => `✓ ${r.count} 条结果（引擎: ${r.engine}）${r.content ? ` — ${r.content}` : ''}${r.sample ? ` · e.g. "${r.sample.slice(0, 40)}"` : ''}`,
    testFail: (e: string) => `✗ ${e}`,
    toggleLang: 'EN',
  },
  en: {
    description: 'Free web search — no API key needed (Bing / DuckDuckGo / AnySearch / Exa / Tavily / Keenable)',
    unsaved: 'unsaved',
    searchEngine: 'Search engine',
    visit: 'Visit website →',
    getKey: 'Get API Key →',
    engineHint: 'Bing is the most stable FREE engine. DuckDuckGo may rate-limit on shared IPs. API KEY engines need credentials below.',
    apiKeys: 'API keys (optional)',
    exaPh: (c: boolean) => c ? 'Exa API key (configured)' : 'Exa API key (optional, free without)',
    tavilyPh: (c: boolean) => c ? 'Tavily API key (configured)' : 'Tavily API key (optional, free without)',
    keenablePh: (c: boolean) => c ? 'Keenable API key (configured)' : 'Keenable API key (optional, free without)',
    perplexityPh: (c: boolean) => c ? 'Perplexity API key (configured)' : 'Perplexity API key (pplx-...)',
    deepseekPh: (c: boolean) => c ? 'DeepSeek API key (configured)' : 'DeepSeek API key (sk-...)',
    keysHint: 'Keys are stored in settings.yaml (redacted in the UI). Enter a key for an engine to use it.',
    platformSearch: 'Platform search (platform_search tool)',
    platformHint: 'Enable platforms for the agent\'s platform_search tool. Disabled platforms are skipped.',
    cacheTtl: 'Result cache TTL (minutes)',
    cacheTtlHint: '0 disables caching, max 5 minutes. Lower = fresher results, higher = less rate-limiting.',
    unavailable: 'Settings unavailable — the bridge is not exposed.',
    saveFailed: 'save failed',
    testing: 'Testing…',
    testEngine: 'Test engine',
    useBing: 'Use Bing default',
    discard: 'Discard',
    saving: 'Saving…',
    save: 'Save',
    testOk: (r: TestResultOk) => `✓ ${r.count} results (engine: ${r.engine})${r.content ? ` — ${r.content}` : ''}${r.sample ? ` · e.g. "${r.sample.slice(0, 40)}"` : ''}`,
    testFail: (e: string) => `✗ ${e}`,
    toggleLang: '中文',
  },
} as const

function tt(lang: Lang) {
  return I18N[lang]
}

async function bridgeDescribe(): Promise<BridgeResponse<DescribeResult>> {
  const response = await fetch(`${BRIDGE_PREFIX}/describe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  return response.json() as Promise<BridgeResponse<DescribeResult>>
}

async function bridgeMutate(payload: unknown): Promise<BridgeResponse<SettingsView>> {
  const response = await fetch(`${BRIDGE_PREFIX}/mutate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return response.json() as Promise<BridgeResponse<SettingsView>>
}

async function bridgeRawSearch(payload: unknown): Promise<BridgeResponse<{ provider?: string; sources?: Array<{ title?: string }>; content?: string }>> {
  const response = await fetch(`${BRIDGE_PREFIX}/raw-search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return response.json() as Promise<BridgeResponse<{ provider?: string; sources?: Array<{ title?: string }>; content?: string }>>
}

interface KeysConfigured {
  exa?: boolean
  tavily?: boolean
  keenable?: boolean
  perplexity?: boolean
  deepseek?: boolean
}

type CardStatus = 'loading' | 'ready' | 'unavailable'

export function FreeSearchCard() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<CardStatus>('loading')
  const [writable, setWritable] = useState(false)
  const [provider, setProvider] = useState('bing')
  const [exaKey, setExaKey] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [keenableKey, setKeenableKey] = useState('')
  const [perplexityKey, setPerplexityKey] = useState('')
  const [deepseekKey, setDeepseekKey] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(['github', 'reddit'])
  const [cacheTtl, setCacheTtl] = useState(5)
  const [keysConfigured, setKeysConfigured] = useState<KeysConfigured>({})
  const [lang, setLang] = useState<Lang>('en')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await bridgeDescribe()
      if (!result.ok || !result.value) {
        setStatus('unavailable')
        return
      }
      const view = result.value.namespaces.find(n => n.ns === NS)
      if (!view) {
        setStatus('unavailable')
        return
      }
      const v = (view.value ?? {}) as Record<string, unknown>
      setProvider((v.provider as string) ?? 'bing')
      setLang((v.lang as string) === 'zh' ? 'zh' : 'en')
      setExaKey((v.exaApiKey as string) ?? '')
      setTavilyKey((v.tavilyApiKey as string) ?? '')
      setKeenableKey((v.keenableApiKey as string) ?? '')
      setPerplexityKey((v.perplexityApiKey as string) ?? '')
      setDeepseekKey((v.deepseekApiKey as string) ?? '')
      setPlatforms(
        Array.isArray(v.platforms) && (v.platforms as string[]).length > 0
          ? v.platforms as string[]
          : ['github', 'reddit'],
      )
      setCacheTtl(
        v.cacheTtl === undefined ? 5 : Math.min(Math.max(Number(v.cacheTtl) || 5, 0), 5),
      )
      const configured: KeysConfigured = {}
      for (const secret of view.secrets ?? []) {
        if (!secret.set) continue
        const path = secret.path.join('.')
        if (path === 'exaApiKey') configured.exa = true
        if (path === 'tavilyApiKey') configured.tavily = true
        if (path === 'keenableApiKey') configured.keenable = true
        if (path === 'perplexityApiKey') configured.perplexity = true
        if (path === 'deepseekApiKey') configured.deepseek = true
      }
      setKeysConfigured(configured)
      setWritable(result.value.writable)
      setStatus('ready')
    } catch {
      setStatus('unavailable')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const ready = status === 'ready'
  const t = tt(lang)
  const currentEngine = ENGINES.find(e => e.id === provider) ?? ENGINES[0]
  const badgeClass = currentEngine.badge === 'FREE' ? 'dshfs-badge dshfs-badgeFree' : 'dshfs-badge dshfs-badgeKey'

  const select = (value: string) => {
    setProvider(value)
    setDirty(true)
    setFailed(false)
  }

  const save = async () => {
    setSaving(true)
    setFailed(false)
    try {
      const ops: Array<{ op: string; path: string[]; value: unknown }> = [
        { op: 'set', path: ['provider'], value: provider },
        { op: 'set', path: ['lang'], value: lang },
      ]
      if (exaKey.trim()) ops.push({ op: 'set', path: ['exaApiKey'], value: exaKey.trim() })
      if (tavilyKey.trim()) ops.push({ op: 'set', path: ['tavilyApiKey'], value: tavilyKey.trim() })
      if (keenableKey.trim()) ops.push({ op: 'set', path: ['keenableApiKey'], value: keenableKey.trim() })
      if (perplexityKey.trim()) ops.push({ op: 'set', path: ['perplexityApiKey'], value: perplexityKey.trim() })
      if (deepseekKey.trim()) ops.push({ op: 'set', path: ['deepseekApiKey'], value: deepseekKey.trim() })
      ops.push({ op: 'set', path: ['platforms'], value: platforms })
      ops.push({ op: 'set', path: ['cacheTtl'], value: Math.min(Math.max(Number(cacheTtl) || 5, 0), 5) })
      const result = await bridgeMutate({ ns: NS, ops })
      if (result.ok) {
        setDirty(false)
        setFailed(false)
        if (result.value?.value) {
          setProvider((result.value.value as Record<string, unknown>).provider as string ?? provider)
        }
        load()
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    load()
    setDirty(false)
    setFailed(false)
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    setFailed(false)
    try {
      const result = await bridgeRawSearch({ query: 'DeepSeek Harness', maxResults: 2, engine: provider })
      if (result.ok && result.value) {
        const sources = result.value.sources ?? []
        setTestResult({
          ok: true,
          count: sources.length,
          engine: result.value.provider ?? provider,
          content: result.value.content ?? '',
          sample: sources[0]?.title ?? '',
        })
      } else {
        setTestResult({ ok: false, error: result.message ?? 'unknown error' })
      }
    } catch {
      setTestResult({ ok: false, error: 'request failed' })
    } finally {
      setTesting(false)
    }
  }

  const toggleLang = () => {
    setLang(prev => prev === 'en' ? 'zh' : 'en')
    setDirty(true)
    setFailed(false)
  }

  if (status === 'loading') return null

  return (
    <li className={open ? 'dshfs-card dshfs-cardOpen' : 'dshfs-card'}>
      <button
        type="button"
        className="dshfs-header"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="dshfs-headText">
          <span className="dshfs-name">Free Web Search</span>
          <span className="dshfs-description">{t.description}</span>
        </span>
        <span className={badgeClass}>{currentEngine.badge}</span>
        {dirty ? <span className="dshfs-pending">{t.unsaved}</span> : null}
        <button
          type="button"
          className="dshfs-btn dshfs-langToggle"
          onClick={(e) => { e.stopPropagation(); toggleLang() }}
        >
          {t.toggleLang}
        </button>
        <span className={open ? 'dshfs-chevron dshfs-chevronOpen' : 'dshfs-chevron'}>{'▾'}</span>
      </button>

      {open ? (
        <div className="dshfs-body">
          <div className="dshfs-field">
            <div className="dshfs-label">
              {t.searchEngine}
              <span className={badgeClass}>{currentEngine.badge}</span>
            </div>
            <select
              className="dshfs-select"
              value={provider}
              disabled={!ready || saving}
              onChange={(e) => select(e.target.value)}
            >
              {ENGINES.map(engine => (
                <option key={engine.id} value={engine.id}>
                  {engine.label} ({engine.badge})
                </option>
              ))}
            </select>
            {currentEngine.link ? (
              <a
                className="dshfs-link"
                href={currentEngine.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {currentEngine.badge === 'FREE' ? t.visit : t.getKey}
              </a>
            ) : null}
            <p className="dshfs-hint">{t.engineHint}</p>
          </div>

          <div className="dshfs-field">
            <div className="dshfs-label">{t.apiKeys}</div>
            <input
              className="dshfs-input"
              type="password"
              placeholder={t.exaPh(!!keysConfigured.exa)}
              value={exaKey}
              disabled={!ready || saving}
              onChange={(e) => { setExaKey(e.target.value); setDirty(true); setFailed(false) }}
            />
            <input
              className="dshfs-input"
              type="password"
              placeholder={t.tavilyPh(!!keysConfigured.tavily)}
              value={tavilyKey}
              disabled={!ready || saving}
              onChange={(e) => { setTavilyKey(e.target.value); setDirty(true); setFailed(false) }}
            />
            <input
              className="dshfs-input"
              type="password"
              placeholder={t.keenablePh(!!keysConfigured.keenable)}
              value={keenableKey}
              disabled={!ready || saving}
              onChange={(e) => { setKeenableKey(e.target.value); setDirty(true); setFailed(false) }}
            />
            <input
              className="dshfs-input"
              type="password"
              placeholder={t.perplexityPh(!!keysConfigured.perplexity)}
              value={perplexityKey}
              disabled={!ready || saving}
              onChange={(e) => { setPerplexityKey(e.target.value); setDirty(true); setFailed(false) }}
            />
            <input
              className="dshfs-input"
              type="password"
              placeholder={t.deepseekPh(!!keysConfigured.deepseek)}
              value={deepseekKey}
              disabled={!ready || saving}
              onChange={(e) => { setDeepseekKey(e.target.value); setDirty(true); setFailed(false) }}
            />
            <p className="dshfs-hint">{t.keysHint}</p>
          </div>

          <div className="dshfs-field">
            <div className="dshfs-label">{t.platformSearch}</div>
            <div className="dshfs-platforms">
              {([['github', 'GitHub'], ['reddit', 'Reddit']] as const).map(([id, label]) => (
                <label key={id} className="dshfs-platform">
                  <input
                    type="checkbox"
                    checked={platforms.includes(id)}
                    disabled={!ready || saving}
                    onChange={(e) => {
                      setPlatforms(prev => e.target.checked ? [...prev, id] : prev.filter(p => p !== id))
                      setDirty(true)
                      setFailed(false)
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="dshfs-hint">{t.platformHint}</p>
          </div>

          <div className="dshfs-field">
            <div className="dshfs-label">{t.cacheTtl}</div>
            <input
              className="dshfs-input dshfs-ttl"
              type="number"
              min={0}
              max={5}
              step={1}
              value={cacheTtl}
              disabled={!ready || saving}
              onChange={(e) => { setCacheTtl(Number(e.target.value)); setDirty(true); setFailed(false) }}
            />
            <p className="dshfs-hint">{t.cacheTtlHint}</p>
          </div>

          <div className="dshfs-resultRow">
            {failed ? <span className="dshfs-failed">{t.saveFailed}</span> : null}
            {testResult ? (
              <span className={testResult.ok ? 'dshfs-testOk' : 'dshfs-failed'}>
                {testResult.ok ? t.testOk(testResult) : t.testFail(testResult.error)}
              </span>
            ) : null}
          </div>

          {!ready ? <p className="dshfs-hint">{t.unavailable}</p> : null}

          <div className="dshfs-footer">
            <div className="dshfs-footerLeft">
              <span className="dshfs-version">dsh-free-web-search</span>
            </div>
            <div className="dshfs-footerRight">
              <button
                className="dshfs-btn"
                type="button"
                onClick={runTest}
                disabled={testing || saving || !ready}
              >
                {testing ? t.testing : t.testEngine}
              </button>
              <button
                className="dshfs-btn"
                type="button"
                onClick={() => { setProvider('bing'); setDirty(true); setFailed(false) }}
                disabled={saving || !ready || provider === 'bing'}
              >
                {t.useBing}
              </button>
              <button
                className="dshfs-btn"
                type="button"
                onClick={discard}
                disabled={saving || !dirty}
              >
                {t.discard}
              </button>
              <button
                className="dshfs-btn dshfs-save"
                type="button"
                onClick={save}
                disabled={saving || !dirty || !ready}
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  )
}

export { ENGINES, bridgeDescribe, bridgeMutate, NS, BRIDGE_PREFIX }
