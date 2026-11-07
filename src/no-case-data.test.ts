// NOTE: cases hold the answer, so nothing the client bundles may reach
// cases/*.json, the case schema and its rules, or the Worker. This walks the client's import graph from every
// non-test module in src/ and fails if it ever lands there.

import { describe, expect, test } from 'vitest'

// NOTE: keys are made repo-relative ("src/view/list.ts", "shared/case.ts").
const sources: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(
      ['./**/*.ts', '../shared/**/*.ts', '../worker/**/*.ts'],
      { query: '?raw', import: 'default', eager: true },
    ),
  ).map(([path, text]) => [
    path.startsWith('./') ? `src/${path.slice(2)}` : path.slice(3),
    text,
  ]),
)

const IMPORT =
  /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]|import\.meta\.glob[^'"]*['"]([^'"]+)['"]/g

const resolve = (from: string, specifier: string): string => {
  const parts = from.split('/').slice(0, -1)
  for (const part of specifier.split('/')) {
    if (part === '..') {
      parts.pop()
    } else if (part !== '.') {
      parts.push(part)
    }
  }
  const path = parts.join('/')
  return path.endsWith('.ts') || path.endsWith('.json') || path.endsWith('*')
    ? path
    : `${path}.ts`
}

const isTest = (path: string): boolean =>
  path.endsWith('.test.ts') || path.endsWith('/fixture.ts')

const reachable = (): ReadonlySet<string> => {
  const seen = new Set<string>()
  const queue = Object.keys(sources).filter(
    path => path.startsWith('src/') && !isTest(path),
  )
  while (queue.length > 0) {
    const path = queue.pop()!
    if (seen.has(path)) {
      continue
    }
    seen.add(path)
    for (const match of (sources[path] ?? '').matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2] ?? match[3] ?? ''
      if (specifier.startsWith('.')) {
        queue.push(resolve(path, specifier))
      }
    }
  }
  return seen
}

describe('client bundle', () => {
  test('never reaches case data, the case schema or the Worker', () => {
    const leaks = [...reachable()].filter(
      path =>
        path.startsWith('cases/') ||
        path.startsWith('worker/') ||
        ['shared/case.ts', 'shared/checker.ts', 'shared/replies.ts'].includes(
          path,
        ),
    )
    expect(leaks).toEqual([])
  })

  test('the guard sees the shared modules the client uses', () => {
    expect(reachable()).toContain('shared/protocol.ts')
  })
})
