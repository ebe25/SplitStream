import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSms, type ParsedSms } from './parser'

type Fixture = { name: string; sender: string; body: string; expected: ParsedSms | null }

const corpus: Fixture[] = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/sms/corpus.json'), 'utf8'),
)

describe('parseSms', () => {
  for (const f of corpus) {
    it(f.name, () => {
      expect(parseSms(f.body)).toEqual(f.expected)
    })
  }
})
