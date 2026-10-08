import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { emptyCaseDraft, hasCaseDraft, reviewCaseDraft, saveCaseWithStory, saveStoryCorrection, findSavedCases, STORY_LIMIT, validateCaseFile } from '../src/case-workflow.js'
import { buildHandoffPacket, handoffToMarkdown } from '../src/intake.js'

const date = '2026-01-01T00:00:00.000Z'
const historical = () => ({ id: 'case-old', title: 'Fictional older case', status: 'CLOSED', type: 'Training', createdAt: date, notes: 'Keep this original note.', evidence: [
  { id: 'record-old', kind: 'note', state: 'DISPUTED', value: 'Original statement.', note: 'Original caveat.', sha256: 'a'.repeat(64), recordedAt: date, screenshot: { id: 'old-screenshot' } },
], timeline: [{ id: 'event-old', at: date, text: 'Original event.' }], analystLinks: [] })
const draft = (changes = {}) => ({ ...emptyCaseDraft(), story: 'A fictional caller asked me to pay with gift cards.', ...changes })
function memoryStorage(store = { cases: [], activeCaseId: null }) {
  let raw = typeof store === 'string' ? store : JSON.stringify(store)
  return { getItem: () => raw, setItem: (_, value) => { raw = value } }
}
const hash = (value) => createHash('sha256').update(value).digest('hex')

test('case review preserves the story, distinguishes an unknown loss from zero, and validates dates', () => {
  const reviewed = reviewCaseDraft(draft({ name: '  Training case  ', incidentDate: '2024-02-29', loss: '00025.5', contacts: ' training@example.invalid ' }))
  assert.equal(reviewed.name, 'Training case')
  assert.equal(reviewed.contacts, 'training@example.invalid')
  assert.deepEqual(reviewed.reportedLoss, { amount: '25.50', currency: 'USD', approximate: true })
  assert.equal(reviewCaseDraft(draft()).reportedLoss, undefined)
  assert.equal(reviewCaseDraft(draft({ loss: '0' })).reportedLoss.amount, '0.00')
  assert.throws(() => reviewCaseDraft(draft({ incidentDate: '2026-02-29' })), /valid incident date/)
})

test('empty, oversized, malformed, and ambiguous draft fields cannot become saved cases', async () => {
  for (const changes of [{ story: '   ' }, { story: 'x'.repeat(STORY_LIMIT + 1) }, { loss: '-1' }, { loss: '1e3' }, { loss: '1.001' }, { loss: '1,000' }, { category: 'invented' }, { incidentDate: '2026-13-01' }]) {
    const storage = memoryStorage()
    const before = storage.getItem()
    await assert.rejects(saveCaseWithStory(draft(changes), { storage }))
    assert.equal(storage.getItem(), before)
  }
})

test('closing a populated draft does not make it empty or persist it', () => {
  assert.equal(hasCaseDraft(emptyCaseDraft()), false)
  assert.equal(hasCaseDraft(draft({ open: false })), true)
  assert.equal(hasCaseDraft(draft({ story: '', loss: '0' })), true)
})

test('saving a case writes its first statement and contact record together without altering history', async () => {
  const original = historical()
  const storage = memoryStorage({ cases: [original], activeCaseId: original.id, extraField: 'retain' })
  const result = await saveCaseWithStory(draft({ contacts: '+1 415 555 0199', incidentDate: '2026-01-02', loss: '12.50' }), { storage })
  assert.deepEqual(result.store.cases[1], original)
  assert.equal(result.store.extraField, 'retain')
  assert.equal(result.store.activeCaseId, result.item.id)
  assert.equal(result.item.evidence.length, 2)
  assert.equal(result.item.evidence[0].value, draft().story)
  assert.equal(result.item.evidence[0].sourceType, 'USER_STATEMENT')
  assert.equal(result.item.evidence[0].state, 'OBSERVED')
  assert.equal(result.item.evidence[0].sha256, hash('note\n' + draft().story))
  assert.equal(result.item.evidence[1].sha256, hash('note\n+1 415 555 0199'))
  assert.equal(result.item.incidentDate, '2026-01-02')
  assert.equal(result.item.reportedLoss.amount, '12.50')
  assert.deepEqual(JSON.parse(storage.getItem()), result.store)
})

test('optional names generate useful titles and unique IDs, without reusing evidence IDs', async () => {
  const storage = memoryStorage()
  const first = (await saveCaseWithStory(draft(), { storage })).item
  const second = (await saveCaseWithStory(draft(), { storage })).item
  assert.match(first.title, /^Scam case — /)
  assert.notEqual(first.id, second.id)
  assert.notEqual(first.evidence[0].id, second.evidence[0].id)
  assert.equal(JSON.parse(storage.getItem()).cases.length, 2)
})

test('a failed case write leaves no folder or statement and preserves the previous workspace', async () => {
  const original = JSON.stringify({ cases: [historical()], activeCaseId: 'case-old' })
  const storage = { getItem: () => original, setItem: () => { throw new DOMException('Full', 'QuotaExceededError') } }
  await assert.rejects(saveCaseWithStory(draft(), { storage }), { name: 'QuotaExceededError' })
  assert.equal(storage.getItem(), original)
})

test('unreadable existing data is never replaced by a newly saved story', async () => {
  for (const raw of ['broken', '{"cases":[null]}', '{"cases":[{"id":"c","evidence":[null]}]}']) {
    let writes = 0
    const storage = { getItem: () => raw, setItem: () => { writes++ } }
    await assert.rejects(saveCaseWithStory(draft(), { storage }))
    assert.equal(writes, 0)
    assert.equal(storage.getItem(), raw)
  }
})

test('receipt-only files get an original-byte hash and a separate record without losing the story', async () => {
  const file = new File(['fictional original bytes'], 'training.txt', { type: 'text/plain' })
  const { item } = await saveCaseWithStory(draft({ file, keepScreenshot: false }), { storage: memoryStorage() })
  assert.equal(item.evidence[0].value, draft().story)
  assert.equal(item.evidence[1].kind, 'file')
  assert.equal(item.evidence[1].fileName, 'training.txt')
  assert.equal(item.evidence[1].sha256, hash('fictional original bytes'))
  assert.equal(item.evidence[1].screenshot, undefined)
  assert.throws(() => validateCaseFile({ name: 'large.png', type: 'image/png', size: 11 * 1024 * 1024 }), /10 MB/)
  assert.doesNotThrow(() => validateCaseFile({ name: 'large.png', type: 'image/png', size: 11 * 1024 * 1024 }, false))
  assert.throws(() => validateCaseFile({ name: 'large.txt', size: 26 * 1024 * 1024 }), /25 MB/)
})

test('a clarification adds a linked user statement while retaining the original state, hash, and image', async () => {
  const original = historical()
  const storage = memoryStorage({ cases: [original], activeCaseId: original.id })
  const result = await saveStoryCorrection(original.id, 'record-old', 'I meant the second call, not the first.', { storage })
  assert.deepEqual(result.cases[0].evidence[1], original.evidence[0])
  assert.deepEqual(result.cases[0].timeline[1], original.timeline[0])
  assert.equal(result.cases[0].evidence[0].correctsRecordId, 'record-old')
  assert.equal(result.cases[0].evidence[0].sourceType, 'USER_STATEMENT')
  assert.equal(result.cases[0].evidence[0].sha256, hash('note\nI meant the second call, not the first.'))
})

test('missing source records and failed clarification writes preserve history', async () => {
  const storage = memoryStorage({ cases: [historical()], activeCaseId: 'case-old' })
  const before = storage.getItem()
  await assert.rejects(saveStoryCorrection('case-old', 'missing', 'Fictional correction', { storage }), /source record/)
  assert.equal(storage.getItem(), before)
  const full = { ...storage, setItem: () => { throw new DOMException('Full', 'QuotaExceededError') } }
  await assert.rejects(saveStoryCorrection('case-old', 'record-old', 'Fictional correction', { storage: full }), { name: 'QuotaExceededError' })
  assert.equal(storage.getItem(), before)
})

test('every handoff keeps incident context, user statements, and linked clarification without changing history', async () => {
  const storage = memoryStorage()
  const { item } = await saveCaseWithStory(draft({ contacts: 'training@example.invalid', incidentDate: '2026-01-02', loss: '25.5' }), { storage })
  const corrected = await saveStoryCorrection(item.id, item.evidence[0].id, 'Fictional clarification.', { storage })
  const current = corrected.cases[0]
  const before = JSON.stringify(current)
  for (const profile of ['victim', 'bank', 'platform', 'law']) {
    const packet = buildHandoffPacket({ item: current, profile })
    assert.equal(packet.case.incidentDate, '2026-01-02')
    assert.equal(packet.case.reportedLoss.amount, '25.50')
    assert.equal(packet.evidence.length, 3)
    assert.equal(packet.evidence[0].correctsRecordId, item.evidence[0].id)
    const markdown = handoffToMarkdown(packet)
    assert.match(markdown, /User statement, not independently verified/)
    assert.match(markdown, /original retained/)
    assert.match(markdown, /25\.50 USD/)
    assert.equal(packet.derivedIntelligence.authority, 'NON_AUTHORITATIVE')
  }
  assert.equal(JSON.stringify(current), before)
})

test('retrieval searches story text, identifiers, record IDs, and filenames with honest filtering', () => {
  const first = historical()
  const second = { ...historical(), id: 'case-second', title: 'Another incident', status: 'OPEN', evidence: [{ id: 'receipt-second', value: 'Contact Training@example.invalid', fileName: 'Fictional-Receipt.PNG' }], createdAt: '2026-02-01T00:00:00.000Z' }
  const cases = [first, second]
  for (const query of ['training@EXAMPLE.invalid', 'receipt-second', 'fictional-receipt.png']) assert.equal(findSavedCases(cases, { query })[0].id, second.id)
  assert.equal(findSavedCases(cases, { query: 'Original statement' })[0].id, first.id)
  assert.deepEqual(findSavedCases(cases, { query: 'missing' }), [])
  assert.deepEqual(findSavedCases(cases, { status: 'OPEN' }).map((item) => item.id), [second.id])
  assert.deepEqual(findSavedCases(cases).map((item) => item.id), [second.id, first.id])
  assert.deepEqual(findSavedCases(cases, { sort: 'oldest' }).map((item) => item.id), [first.id, second.id])
  assert.deepEqual(findSavedCases(cases, { sort: 'title' }).map((item) => item.id), [second.id, first.id])
  assert.deepEqual(cases, [first, second])
})
