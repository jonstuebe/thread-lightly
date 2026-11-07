// NOTE: `bun run cases:check [file ...]` runs the solvability checker on case
// files and prints every problem. With no arguments it checks all of cases/.
// The generate-case skill runs it after each draft; it exits 1 on any problem.

import { Array, Effect, Exit, pipe } from 'effect'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

import { type Problem, validateCase } from '../shared/checker'

const CASES_DIR = 'cases'

const allCaseFiles = (): ReadonlyArray<string> =>
  pipe(
    readdirSync(CASES_DIR),
    Array.filter(name => name.endsWith('.json')),
    Array.sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)),
    Array.map(name => join(CASES_DIR, name)),
  )

type Report = Readonly<{
  file: string
  maybeId: string | undefined
  problems: ReadonlyArray<Problem>
}>

const readJson = (file: string): unknown | Error => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

const checkFile = (file: string): Report => {
  const json = readJson(file)
  if (json instanceof Error) {
    return {
      file,
      maybeId: undefined,
      problems: [{ check: 'schema', message: `not JSON: ${json.message}` }],
    }
  }
  const exit = Effect.runSyncExit(validateCase(json))
  const expectedId = basename(file, '.json')
  if (Exit.isSuccess(exit)) {
    const id = exit.value.id
    return {
      file,
      maybeId: id,
      problems:
        id === expectedId
          ? []
          : [
              {
                check: 'references',
                message: `case id "${id}" must match the file name "${expectedId}"`,
              },
            ],
    }
  }
  const problems = pipe(
    exit.cause.reasons,
    Array.flatMap(reason =>
      reason._tag === 'Fail'
        ? reason.error.problems
        : [{ check: 'schema' as const, message: String(reason) }],
    ),
  )
  return { file, maybeId: expectedId, problems }
}

const files = process.argv.slice(2)
const reports = Array.map(
  Array.isArrayNonEmpty(files) ? files : allCaseFiles(),
  checkFile,
)

const ids = Array.flatMap(reports, report =>
  report.maybeId === undefined ? [] : [report.maybeId],
)
const duplicateIds = Array.dedupe(
  Array.filter(ids, (id, index) => ids.indexOf(id) !== index),
)

let failed = false
for (const report of reports) {
  if (Array.isReadonlyArrayEmpty(report.problems)) {
    console.log(`✓ ${report.file}`)
    continue
  }
  failed = true
  console.log(`✗ ${report.file} (${report.problems.length} problems)`)
  for (const { check, message } of report.problems) {
    console.log(`  [${check}] ${message}`)
  }
}
for (const id of duplicateIds) {
  failed = true
  console.log(`✗ case id "${id}" is used by more than one file`)
}

process.exit(failed ? 1 : 0)
