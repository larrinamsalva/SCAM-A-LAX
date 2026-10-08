import test from 'node:test'
import assert from 'node:assert/strict'
import { readWorkspace, writeWorkspace } from '../src/workspace-storage.js'

test('failed workspace writes leave the persisted case and evidence unchanged', () => {
  const raw = JSON.stringify({ cases: [{ id: 'first', evidence: [{ id: 'old' }] }], activeCaseId: 'first' })
  const storage = { getItem: () => raw, setItem: () => { throw new DOMException('Full', 'QuotaExceededError') } }
  assert.throws(() => writeWorkspace((current) => ({ ...current, cases: [] }), storage), { name: 'QuotaExceededError' })
  assert.equal(storage.getItem(), raw)
})

test('unreadable workspace data is never replaced by an empty store', () => {
  for (const raw of ['not-json', '{}', 'null']) {
    let writes = 0
    const storage = { getItem: () => raw, setItem: () => { writes++ } }
    assert.throws(() => readWorkspace(storage))
    assert.throws(() => writeWorkspace(() => ({ cases: [] }), storage))
    assert.equal(writes, 0)
  }
})

test('updates read the latest persisted workspace and preserve unrelated records', () => {
  let raw = JSON.stringify({ cases: [{ id: 'older' }, { id: 'added-in-another-tab' }], activeCaseId: 'older' })
  const storage = { getItem: () => raw, setItem: (_, next) => { raw = next } }
  const updated = writeWorkspace((current) => ({ ...current, activeCaseId: 'added-in-another-tab' }), storage)
  assert.deepEqual(updated.cases.map((item) => item.id), ['older', 'added-in-another-tab'])
  assert.equal(JSON.parse(raw).activeCaseId, 'added-in-another-tab')
})
