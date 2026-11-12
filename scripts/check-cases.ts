// NOTE: `bun run cases:check [file ...]` runs the solvability checker on case
// files and prints every problem. With no arguments it checks all of cases/.
// The generate-case skill runs it after each draft. It exits 1 on any error;
// warnings are printed but don't fail.

import { Array, Exit, Schema, pipe } from 'effect'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

import { Case } from '../shared/case'
import { type Problem, findProblems, isError } from '../shared/checker'

const CASES_DIR = 'cases'

const allCaseFiles = (): ReadonlyArray<string> =>
  existsSync(CASES_DIR)
    ? pipe(
        readdirSync(CASES_DIR),
        Array.filter(name => name.endsWith('.json')),
        Array.sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)),
        Array.map(name => join(CASES_DIR, name)),
      )
    : []

type Report = Readonly<{
  file: string
  maybeId: string | undefined
  problems: ReadonlyArray<Problem>
}>

const schemaProblem = (message: string): Problem => ({
  check: 'schema',
  severity: 'error',
  message,
})

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
      problems: [schemaProblem(`not JSON: ${json.message}`)],
    }
  }
  const decoded = Schema.decodeUnknownExit(Case)(json)
  const expectedId = basename(file, '.json')
  if (Exit.isFailure(decoded)) {
    return {
      file,
      maybeId: expectedId,
      problems: [schemaProblem(String(decoded.cause))],
    }
  }
  const caseData = decoded.value
  return {
    file,
    maybeId: caseData.id,
    problems: [
      ...(caseData.id === expectedId
        ? []
        : [
            {
              check: 'references' as const,
              severity: 'error' as const,
              message: `case id "${caseData.id}" must match the file name "${expectedId}"`,
            },
          ]),
      ...findProblems(caseData),
    ],
  }
}

const files = process.argv.slice(2)
const caseFiles = Array.isArrayNonEmpty(files) ? files : allCaseFiles()
if (Array.isReadonlyArrayEmpty(caseFiles)) {
  console.log(`no case files in ${CASES_DIR}/`)
}
const reports = Array.map(caseFiles, checkFile)

const ids = Array.flatMap(reports, report =>
  report.maybeId === undefined ? [] : [report.maybeId],
)
const duplicateIds = Array.dedupe(
  Array.filter(ids, (id, index) => ids.indexOf(id) !== index),
)

const printReport = (report: Report): boolean => {
  const errors = Array.filter(report.problems, isError)
  const warnings = Array.filter(report.problems, problem => !isError(problem))
  const mark = Array.isArrayNonEmpty(errors) ? '✗' : '✓'
  const counts = [
    ...(Array.isArrayNonEmpty(errors) ? [`${errors.length} errors`] : []),
    ...(Array.isArrayNonEmpty(warnings) ? [`${warnings.length} warnings`] : []),
  ]
  console.log(
    Array.isArrayNonEmpty(counts)
      ? `${mark} ${report.file} (${counts.join(', ')})`
      : `${mark} ${report.file}`,
  )
  Array.forEach(errors, ({ check, message }) =>
    console.log(`  [${check}] ${message}`),
  )
  Array.forEach(warnings, ({ check, message }) =>
    console.log(`  warning [${check}] ${message}`),
  )
  return Array.isArrayNonEmpty(errors)
}

const failedReports = Array.filter(reports, printReport)
Array.forEach(duplicateIds, id =>
  console.log(`✗ case id "${id}" is used by more than one file`),
)

process.exit(
  Array.isArrayNonEmpty(failedReports) || Array.isArrayNonEmpty(duplicateIds)
    ? 1
    : 0,
)
