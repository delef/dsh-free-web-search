# dsh-free-web-search

Free web search plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). No API keys required — works out of the box with Bing, DuckDuckGo, and SearXNG. Optional paid engines (Exa, Tavily, Keenable, Perplexity, DeepSeek Official) activate when you add a key.

## Features

- **10 search engines** with automatic fallback — if one fails, the next one picks up
- **Time-filtered search** via `advanced_search` tool (last day/week/month/year, or custom ranges like `3d`, `2mo`, `2026-07-01`)
- **Platform search** — GitHub repos and Reddit threads via `platform_search` tool
- **Engine diagnostics** — `free_search_test` tool to check which engines work
- **Web Settings UI** — engine selection, API key management, cache TTL config
- **Result caching** — LRU cache (50 entries, configurable TTL up to 5 min) to reduce rate limiting

## Install

```bash
dsh plugin --profile web add github:delef/dsh-free-web-search
```

If pnpm blocks the build script, add the key it prints to `allowBuilds` in your profile's `pnpm-workspace.yaml` and retry.

## Engines

| Engine | Cost | Key required |
|--------|------|-------------|
| Bing | Free | No |
| DuckDuckGo (HTML / Lite) | Free | No |
| SearXNG | Free | No |
| AnySearch AI | Free | No |
| Exa | Free tier / paid | Optional |
| Tavily | Free tier / paid | Optional |
| Keenable | Free tier / paid | Optional |
| Perplexity | Paid | Yes |
| DeepSeek Official | Paid | Yes |

Default engine: **Bing** (most stable). Change it in Settings > Plugins > Free Web Search, or type `/free-search-engine` in chat.

## Tools

### `web_search` (built-in, powered by this plugin)

Standard harness web search. Uses the configured engine with automatic fallback.

### `advanced_search`

```
query: "rust async runtime"
timeRange: "week"        # day | week | month | year | 3d | 2mo | 1y | 2026-07-01
engine: "exa"            # optional, override preferred engine
maxResults: 5
```

### `platform_search`

```
platform: "github"       # github | reddit
query: "deepseek harness plugins"
maxResults: 5
```

### `web_fetch`

```
url: "https://docs.example.com/guide"
maxLength: 50000                       # optional, default 50000 chars
```

Fetches a single page, strips HTML, returns plain text. For reading articles, docs, or any URL.

### `free_search_test`

Tests engine availability. No arguments tests all engines.

## Configuration

Settings are managed through the web UI (Settings > Plugins > Free Web Search) or in the `free-web-search` entry of the active profile (DSH 0.2+; earlier releases used the `free-search` section of `settings.yaml`):

```yaml
- id: free-web-search
  name: dsh-free-web-search
  config:
    provider: bing
    bingMarket: en-US
    cache: true
    cacheTtl: 5
    platforms:
      - github
      - reddit
    searxngInstances:        # optional, overrides default public instances
      - https://your-instance.example.com
    # Optional API keys
    exaApiKey: ""
    tavilyApiKey: ""
    keenableApiKey: ""
    perplexityApiKey: ""
    deepseekApiKey: ""
```

Profiles that still use the old entry id `web-search-free` keep working, but the plugin logs a deprecation warning and the settings card shows a notice. Rename the entry to `free-web-search` to migrate.

Requires DSH `>=0.2.0-rc.2` (developed against `0.2.1-rc.5`).

## License

Apache-2.0
