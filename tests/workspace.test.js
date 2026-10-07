import test from 'node:test'
import assert from 'node:assert/strict'
import { BACKUP_SCHEMA, MAX_BACKUP_BYTES, WORKSPACE_KEY, mergeWorkspaceRestore, parseWorkspaceBackup, previewWorkspaceRestore, readWorkspace, restoreWorkspace, saveWorkspace, validateWorkspace } from '../src/workspace.js'

const date = '2026-01-01T00:00:00.000Z'
const empty = () => ({ cases: [], activeCaseId: null })
const makeCase = (id = 'case-original') => ({
  id, title: `Case ${id}`, victimAlias: 'Fictional helper', type: 'Training', status: 'OPEN', createdAt: date, notes: 'Keep this note.',
  evidence: [
    { id: 'ev-text', kind: 'message', state: 'INFERRED', value: 'training@example.invalid', note: 'Original caveat', recordedAt: date, sha256: 'a'.repeat(64), intake: { mode: 'text', sourceLabel: 'Training', batch: true } },
    { id: 'ev-file', kind: 'file', state: 'DISPUTED', value: '', note: '', recordedAt: date, sha256: 'b'.repeat(64), fileName: 'receipt.txt', fileSize: 42, fileType: 'text/plain' },
  ],
  timeline: [{ id: 'event', at: date, text: 'Case created.' }],
  analystLinks: [{ id: 'link', from: 'email:training@example.invalid', to: 'domain:example.invalid', relation: 'RELATED_TO', state: 'CORRELATED', note: 'A hypothesis only.', createdAt: date }],
})
const workspace = (...cases) => ({ cases, activeCaseId: cases[0]?.id || null })
const packet = (store) => ({ schema: BACKUP_SCHEMA, exportedAt: date, appVersion: 'v0.6.0-alpha', store })
const parsed = (store) => parseWorkspaceBackup(JSON.stringify(packet(store)))
const storage = (initial = null) => {
  let raw = initial
  let writes = 0
  return {
    getItem(key) { assert.equal(key, WORKSPACE_KEY); return raw },
    setItem(key, value) { assert.equal(key, WORKSPACE_KEY); raw = value; writes++ },
    get writes() { return writes },
  }
}

test('workspace backup roundtrip preserves evidence semantics, dates, links and file receipts', () => {
  const source = workspace(makeCase())
  const backup = parsed(source)
  const result = mergeWorkspaceRestore(empty(), backup, source.cases.map((item) => item.id))
  assert.deepEqual(result.store, source)
  assert.deepEqual(source, workspace(makeCase()), 'The source workspace was mutated')
  assert.equal(result.added, 1)
})

test('early cases receive missing optional collections without changing evidence', () => {
  const item = makeCase()
  delete item.notes
  delete item.timeline
  delete item.analystLinks
  const loaded = parsed(workspace(item)).store.cases[0]
  assert.equal(loaded.notes, '')
  assert.deepEqual(loaded.timeline, [])
  assert.deepEqual(loaded.analystLinks, [])
  assert.deepEqual(loaded.evidence, item.evidence)
})

test('preview classifies duplicates, changed versions and new cases without mutating data', () => {
  const current = workspace(makeCase('same'), makeCase('changed'))
  const changed = { ...makeCase('changed'), notes: 'A different version.' }
  const backup = parsed(workspace(makeCase('same'), changed, makeCase('new')))
  assert.deepEqual(previewWorkspaceRestore(current, backup).map((row) => row.status), ['duplicate', 'copy', 'new'])
  assert.equal(current.cases.length, 2)
  assert.equal(current.cases[1].notes, 'Keep this note.')
})

test('selected restore preserves originals, copies colliding IDs and skips duplicate reimports', () => {
  const original = makeCase()
  const changed = { ...original, notes: 'An older backup note.' }
  const backup = parsed(workspace(changed, makeCase('selected'), makeCase('excluded')))
  const result = mergeWorkspaceRestore(workspace(original), backup, [original.id, 'selected'], () => 'copy-id')
  assert.equal(result.added, 2)
  assert.equal(result.copies, 1)
  assert.equal(result.store.activeCaseId, original.id)
  assert.deepEqual(result.store.cases[0], original)
  assert.deepEqual(result.store.cases[1], { ...changed, id: 'copy-id', restore: { sourceCaseId: original.id } })
  assert.equal(result.store.cases.some((item) => item.id === 'excluded'), false)
  assert.deepEqual(previewWorkspaceRestore(result.store, backup).map((row) => row.status), ['duplicate', 'duplicate', 'new'])
  const repeated = mergeWorkspaceRestore(result.store, backup, [original.id, 'selected'])
  assert.equal(repeated.added, 0)
  assert.equal(repeated.skipped, 2)
  assert.deepEqual(repeated.store, result.store)
})

test('identical objects with different key order are duplicates; separate case IDs remain separate', () => {
  const item = makeCase()
  const reversed = Object.fromEntries(Object.entries(item).reverse())
  const backup = parsed(workspace(reversed, makeCase('separate')))
  assert.deepEqual(previewWorkspaceRestore(workspace(item), backup).map((row) => row.status), ['duplicate', 'new'])
})

test('restore uses the backup active case only when the current workspace has no active case', () => {
  const backup = parsed({ cases: [makeCase('one'), makeCase('two')], activeCaseId: 'two' })
  assert.equal(mergeWorkspaceRestore(empty(), backup, ['one', 'two']).store.activeCaseId, 'two')
  assert.equal(mergeWorkspaceRestore(empty(), backup, ['one']).store.activeCaseId, 'one')
  assert.equal(validateWorkspace({ cases: [], activeCaseId: 'missing' }).activeCaseId, null)
})

test('malformed, unsupported and overlarge backups are rejected before any write', () => {
  assert.throws(() => parseWorkspaceBackup('{broken'), /not readable JSON/)
  assert.throws(() => parseWorkspaceBackup('null'), /workspace backup/)
  assert.throws(() => parseWorkspaceBackup(JSON.stringify({ schema: 'scamalax.case.v2' })), /workspace backup/)
  assert.throws(() => parseWorkspaceBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /10 MB/)
  assert.throws(() => parseWorkspaceBackup(JSON.stringify({ ...packet(empty()), exportedAt: 'yesterday' })), /timestamp/)
  const polluted = JSON.stringify(packet(empty())).replace('"store":{', '"store":{"__proto__":{},')
  assert.throws(() => parseWorkspaceBackup(polluted), /unsupported object key/)
  assert.equal({}.polluted, undefined)
})

test('invalid records cannot change labels, weaken hashes, duplicate IDs or include original file contents', () => {
  const mutations = [
    (item) => { item.status = 'UNSUPPORTED' },
    (item) => { item.evidence[0].state = 'VERIFIED' },
    (item) => { item.evidence[0].sha256 = 'short' },
    (item) => { item.evidence.push({ ...item.evidence[0] }) },
    (item) => { item.evidence[1].fileSize = -1 },
    (item) => { item.evidence[1].value = 'raw file content' },
    (item) => { item.analystLinks[0].from = null },
    (item) => { item.timeline[0].at = 'bad date' },
  ]
  for (const mutate of mutations) {
    const item = makeCase()
    mutate(item)
    assert.throws(() => parsed(workspace(item)))
  }
  assert.throws(() => parsed(workspace(makeCase(), makeCase())), /duplicate IDs/)
  assert.throws(() => parsed(workspace(...Array.from({ length: 1001 }, (_, index) => ({ ...makeCase(`case-${index}`), evidence: [] })))), /1000 cases/)
})

test('invalid selections and generated IDs abort the merge without touching the original', () => {
  const current = workspace(makeCase())
  const backup = parsed(workspace({ ...makeCase(), notes: 'Changed' }))
  assert.throws(() => mergeWorkspaceRestore(current, backup, ['missing']), /selection/)
  assert.throws(() => mergeWorkspaceRestore(current, backup, [current.activeCaseId], () => current.activeCaseId), /unique/)
  assert.deepEqual(current, workspace(makeCase()))
})

test('confirmation merges with the latest saved cases, including another tab’s edits', () => {
  const backup = parsed(workspace(makeCase('incoming')))
  const current = workspace(makeCase('existing'))
  previewWorkspaceRestore(current, backup)
  const saved = storage(JSON.stringify(workspace({ ...makeCase('existing'), notes: 'Updated in another tab' }, makeCase('other-tab'))))
  const result = restoreWorkspace(saved, backup, ['incoming'])
  assert.equal(saved.writes, 1)
  assert.deepEqual(result.store.cases.map((item) => item.id), ['existing', 'other-tab', 'incoming'])
  assert.equal(result.store.cases[0].notes, 'Updated in another tab')
  assert.deepEqual(JSON.parse(saved.getItem(WORKSPACE_KEY)), result.store)
})

test('duplicates and cancelled selections perform no writes', () => {
  const source = workspace(makeCase())
  const raw = JSON.stringify(source)
  const saved = storage(raw)
  assert.equal(restoreWorkspace(saved, parsed(source), [source.activeCaseId]).added, 0)
  assert.equal(restoreWorkspace(saved, parsed(workspace(makeCase('new'))), []).added, 0)
  assert.equal(saved.writes, 0)
  assert.equal(saved.getItem(WORKSPACE_KEY), raw)
})

test('damaged or inaccessible saved storage is never replaced with an empty workspace', () => {
  for (const raw of ['{damaged', JSON.stringify({ cases: [null] })]) {
    const saved = storage(raw)
    assert.throws(() => readWorkspace(saved), /left untouched/)
    assert.throws(() => restoreWorkspace(saved, parsed(workspace(makeCase())), ['case-original']), /left untouched/)
    assert.equal(saved.writes, 0)
    assert.equal(saved.getItem(WORKSPACE_KEY), raw)
  }
  assert.throws(() => readWorkspace({ getItem() { throw new Error('blocked') } }), /cannot be accessed/)
})

test('quota failures report failure and preserve the previously saved bytes', () => {
  const raw = JSON.stringify(workspace(makeCase('existing')))
  const saved = { getItem: () => raw, setItem: () => { throw new Error('QuotaExceededError') } }
  assert.throws(() => restoreWorkspace(saved, parsed(workspace(makeCase('new'))), ['new']), /could not save this restore/)
  assert.throws(() => saveWorkspace(saved, raw, empty()), /could not save this change/)
  assert.equal(saved.getItem(WORKSPACE_KEY), raw)
})

test('ordinary edits reject stale data; restore rejects storage that changes during preparation', () => {
  const raw = JSON.stringify(workspace(makeCase('existing')))
  const saved = storage(raw)
  assert.throws(() => saveWorkspace(saved, null, empty()), /another tab/)
  assert.equal(saved.writes, 0)
  let reads = 0
  const racing = { getItem: () => ++reads === 1 ? raw : 'changed', setItem: () => assert.fail('Must not write') }
  assert.throws(() => restoreWorkspace(racing, parsed(workspace(makeCase('incoming'))), ['incoming']), /changed while preparing/)
})
