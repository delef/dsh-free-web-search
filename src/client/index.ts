// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Context = any
import { FreeSearchCard, ENGINES, bridgeDescribe, bridgeMutate, NS } from './FreeSearchCard.js'

export const inject = ['slots', 'commandUi'] as const

export function apply(ctx: Context) {
  // The configurable-plugins tab dispatches one slot key per served namespace,
  // so the card's key must be the settings namespace it edits.
  ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register(
      {
        name: 'settings.plugin.item',
        key: NS,
        inject: () => ({}),
      },
      FreeSearchCard,
    ),
  )

  ctx.inject(['commandUi'], (sctx: Context) => {
    const command = sctx.get('commandUi')
    sctx.effect(() => {
      const dispose = command.register({
        name: 'free-search-engine',
        description: 'Switch web search engine',
        available: () => true,
        ui: {
          kind: 'popupSelect',
          options: async () => {
            const result = await bridgeDescribe()
            const view = result.ok ? result.value?.namespaces.find((n: { ns: string }) => n.ns === NS) : undefined
            const current = (view?.value as Record<string, unknown> | undefined)?.provider as string ?? 'bing'
            return ENGINES.map(e => ({
              id: e.id,
              label: `${e.label}${e.badge === 'FREE' ? ' · Free' : ' · API Key'}`,
              detail: e.id === current ? 'current' : undefined,
              active: e.id === current,
            }))
          },
          onSelect: async (option: { id: string }) => {
            await bridgeMutate({ ns: NS, ops: [{ op: 'set', path: ['provider'], value: option.id }] })
          },
        },
      })
      return dispose
    }, 'free-web-search: /free-search-engine command')
  })
}
