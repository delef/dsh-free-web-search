// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Context = any
import { FreeSearchTab, ENGINES, bridgeDescribe, bridgeMutate, findView, NS } from './FreeSearchCard.js'

export const inject = ['slots', 'commandUi'] as const

export function apply(ctx: Context) {
  // dsh ≥0.2 dropped `settings.plugin.item`; feature pages now register a tab
  // into the Plugins section via `settings.plugins.tab`.
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      {
        name: 'settings.plugins.tab',
        id: 'free-web-search',
        order: 120,
        label: () => 'Free Web Search',
        inject: () => ({}),
      },
      FreeSearchTab,
    ),
  )

  ctx.inject(['commandUi'], (sctx: Context) => {
    const command = sctx.get('commandUi')
    sctx.effect(() => {
      const dispose = command.register({
        name: 'free-search-engine',
        description: () => 'Switch web search engine',
        available: () => true,
        ui: {
          kind: 'popupSelect',
          options: async () => {
            const result = await bridgeDescribe()
            const view = result.ok ? findView(result.value?.namespaces ?? []) : undefined
            const current = (view?.value as Record<string, unknown> | undefined)?.provider as string ?? 'bing'
            return ENGINES.map(e => ({
              id: e.id,
              label: `${e.label}${e.badge === 'FREE' ? ' · Free' : ' · API Key'}`,
              detail: e.id === current ? 'current' : undefined,
              active: e.id === current,
            }))
          },
          onSelect: async (option: { id: string }) => {
            const result = await bridgeDescribe()
            const view = result.ok ? findView(result.value?.namespaces ?? []) : undefined
            await bridgeMutate({ ns: view?.ns ?? NS, ops: [{ op: 'set', path: ['provider'], value: option.id }] })
          },
        },
      })
      return dispose
    }, 'free-web-search: /free-search-engine command')
  })
}
