import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { BRIDGE_PREFIX, makeBridgeRoutes } from '../lib/bridge/routes.js'

type Descriptor = { ns: string; schema: unknown; value: unknown; revision: number }

function fakeSettings(namespaces: string[]) {
  const descriptors: Descriptor[] = namespaces.map((ns) => ({ ns, schema: {}, value: { provider: 'bing' }, revision: 1 }))
  const mutated: string[] = []
  return {
    mutated,
    service: {
      describe: () => descriptors,
      mutate: async (ns: string) => { mutated.push(ns) },
      writable: true,
    },
  }
}

async function call(routes: ReturnType<typeof makeBridgeRoutes>, name: string, body: unknown = {}) {
  const route = routes.find((r) => r.path === `${BRIDGE_PREFIX}/${name}`)
  assert.ok(route, `route ${name} exists`)
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'POST',
    headers: { host: '127.0.0.1:3000' },
    socket: { remoteAddress: '127.0.0.1' },
  })
  let payload = ''
  const res = { writeHead() {}, end(chunk: string) { payload = chunk } }
  await route.handler(req as never, res as never)
  return JSON.parse(payload)
}

const routesFor = (namespaces: string[]) => {
  const { service, mutated } = fakeSettings(namespaces)
  return { routes: makeBridgeRoutes(service, async () => ({}) as never, async () => ({ ok: false, error: 'n/a' })), mutated }
}

test('the current entry id is exposed', async () => {
  const { routes } = routesFor(['free-web-search', 'other'])
  const out = await call(routes, 'describe')
  assert.deepEqual(out.value.namespaces.map((n: { ns: string }) => n.ns), ['free-web-search'])
})

test('a profile that still uses the legacy entry id keeps working', async () => {
  const { routes, mutated } = routesFor(['web-search-free'])
  const described = await call(routes, 'describe')
  assert.deepEqual(described.value.namespaces.map((n: { ns: string }) => n.ns), ['web-search-free'])
  const out = await call(routes, 'mutate', { ns: 'web-search-free', ops: [{ op: 'set', path: ['provider'], value: 'ddg' }] })
  assert.equal(out.ok, true)
  assert.deepEqual(mutated, ['web-search-free'])
})

test('when both ids exist the current one is listed first', async () => {
  const { routes } = routesFor(['web-search-free', 'free-web-search'])
  const out = await call(routes, 'describe')
  assert.deepEqual(out.value.namespaces.map((n: { ns: string }) => n.ns), ['free-web-search', 'web-search-free'])
})

test('an unrelated entry id is refused', async () => {
  const { routes, mutated } = routesFor(['free-web-search', 'llm-deepseek'])
  const out = await call(routes, 'mutate', { ns: 'llm-deepseek', ops: [] })
  assert.equal(out.ok, false)
  assert.equal(out.code, 'settings-not-exposed')
  assert.deepEqual(mutated, [])
})
