import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPhoneIndex, normalizePhoneQuery } from '../src/phone-tracker.js'

test('phone queries accept one formatted number and keep country-code ambiguity', () => {
  assert.equal(normalizePhoneQuery('+1 (415) 555-0199'), '+14155550199')
  assert.equal(normalizePhoneQuery(' (415) 555-0199 '), '4155550199')
  for (const value of ['', null, 'Call +1 415 555 0199', '555-0199', '+1 415 555 0199 ext 4', '+1234567890123456', 'https://example.invalid/4155550199', '4155550199;2125550199']) {
    assert.equal(normalizePhoneQuery(value), null, String(value))
  }
})

test('the number index links each source record once and preserves evidence labels', () => {
  const cases = [
    { id: 'a', title: 'First case', evidence: [
      { id: 'a1', value: 'Call +1 415 555 0199 or +1 (415) 555-0199', state: 'OBSERVED' },
      { id: 'a2', value: 'My analysis', note: 'Callback +1 415 555 0199', state: 'INFERRED' },
    ] },
    { id: 'b', title: 'Second case', evidence: [{ id: 'b1', value: '+1 (415) 555-0199', state: 'UNKNOWN' }] },
  ]
  const original = structuredClone(cases)
  const index = buildPhoneIndex(cases)
  assert.equal(index.length, 1)
  assert.equal(index[0].number, '+14155550199')
  assert.equal(index[0].recordCount, 3)
  assert.deepEqual(index[0].cases.map((item) => item.caseId), ['a', 'b'])
  assert.deepEqual(index[0].cases.flatMap((item) => item.records.map((record) => record.state)), ['OBSERVED', 'INFERRED', 'UNKNOWN'])
  assert.deepEqual(cases, original)
})

test('a local number does not silently match a country-coded number', () => {
  const index = buildPhoneIndex([{ id: 'a', evidence: [
    { id: 'coded', value: '+1 415 555 0199' },
    { id: 'local', value: '(415) 555-0199' },
  ] }])
  assert.equal(index.length, 2)
  assert.deepEqual(index.find((entry) => entry.number === normalizePhoneQuery('415-555-0199')).cases[0].records.map((record) => record.id), ['local'])
  assert.equal(index.find((entry) => entry.number === normalizePhoneQuery('+1 212 555 0123')), undefined)
})

test('bad case shapes do not crash the index or become phone records', () => {
  assert.deepEqual(buildPhoneIndex(null), [])
  assert.deepEqual(buildPhoneIndex([null, {}, { id: 'bad', evidence: [null, { id: 'object', value: {} }] }]), [])
})
