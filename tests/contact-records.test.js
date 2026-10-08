import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { emptyContactDraft, hasContactDraft, reviewContactDraft, contactRecordText, saveContactRecord, CONTACT_CHANNELS } from '../src/contact-records.js'
import { STORY_LIMIT, findSavedCases, saveStoryCorrection } from '../src/case-workflow.js'
import { buildHandoffPacket, evidenceValueMarkdown, handoffToMarkdown } from '../src/intake.js'
import { buildPhoneIndex } from '../src/phone-tracker.js'

const original = () => ({ id: 'old-case', title: 'Fictional existing case', status: 'OPEN', createdAt: '2026-01-01T00:00:00.000Z', notes: 'Keep this note.', evidence: [{ id: 'old-record', kind: 'note', state: 'DISPUTED', value: 'Original source.', note: 'Original caveat.', sha256: 'a'.repeat(64), recordedAt: '2026-01-01T00:00:00.000Z', screenshot: { id: 'original-image' } }], timeline: [{ id: 'original-event', at: '2026-01-01T00:00:00.000Z', text: 'Original event.' }], analystLinks: [], extraCaseField: 'retain' })
const draft = (changes = {}) => ({ ...emptyContactDraft(), whatHappened: 'Fictional caller asked me to stay on the phone at the register.', ...changes })
const hash = (value) => createHash('sha256').update(value).digest('hex')
function memoryStorage(initial = { cases: [original()], activeCaseId: 'old-case', extraWorkspaceField: 'retain' }) {
  let raw = typeof initial === 'string' ? initial : JSON.stringify(initial)
  let writes = 0
  return { getItem: () => raw, setItem: (_, value) => { raw = value; writes++ }, writes: () => writes }
}

test('contact review retains source time and Unicode language without inventing an identity or UTC time', () => {
  const details = reviewContactDraft(draft({ date: '2024-02-29', time: '15:07', timeZone: 'Pacific time', language: 'हिन्दी / Hindi', sender: ' +1 415 555 0199 ', claimedIdentity: 'Claimed bank agent', keptOnPhone: 'yes', quickCallback: 'unsure' }))
  assert.equal(details.sender, '+1 415 555 0199')
  assert.equal(details.language, 'हिन्दी / Hindi')
  assert.equal(details.date, '2024-02-29')
  assert.equal(details.time, '15:07')
  assert.equal(details.timeZone, 'Pacific time')
  assert.equal(details.occurredAt, undefined)
  const text = contactRecordText(details)
  assert.match(text, /Claimed name or organization \(unverified\): Claimed bank agent/)
  assert.match(text, /pressured you to continue\? Not sure/)
  assert.match(contactRecordText(reviewContactDraft(draft())), /Contact date \(user supplied\): Not provided/)
})

test('every meaningful contact field triggers draft protection without treating an empty form as dirty', () => {
  assert.equal(hasContactDraft(emptyContactDraft()), false)
  for (const changes of [{ sender: 'Fictional caller' }, { language: 'English' }, { quickCallback: 'no' }, { channel: 'Email' }, { time: '09:30' }, { file: new File(['text'], 'note.txt') }]) assert.equal(hasContactDraft({ ...emptyContactDraft(), ...changes }), true)
})

test('empty, oversized, invalid dates/times, and unsupported answers cannot replace saved cases', async () => {
  for (const changes of [{ whatHappened: '   ' }, { whatHappened: 'x'.repeat(STORY_LIMIT + 1) }, { sender: 'x'.repeat(501) }, { language: ['English'] }, { channel: 'invented' }, { basis: 'Verified court evidence' }, { date: '2026-02-29' }, { date: '2026-13-01' }, { time: '24:00' }, { time: '9:30' }, { quickCallback: 'maybe' }]) {
    const storage = memoryStorage(), before = storage.getItem()
    await assert.rejects(saveContactRecord('old-case', draft(changes), { storage }))
    assert.equal(storage.getItem(), before)
    assert.equal(storage.writes(), 0)
  }
})

test('one save appends a hashed user statement atomically while keeping historical and other case data', async () => {
  const old = original(), second = { ...original(), id: 'other-case', title: 'Another case' }
  const storage = memoryStorage({ cases: [old, second], activeCaseId: old.id, extraWorkspaceField: 'retain' })
  const { store, record } = await saveContactRecord(old.id, draft({ date: '2026-01-02', language: 'Spanish', keptOnPhone: 'yes' }), { storage })
  assert.equal(storage.writes(), 1)
  assert.equal(record.sourceType, 'USER_STATEMENT')
  assert.equal(record.state, 'OBSERVED')
  assert.equal(record.contact.schema, 'scamalax.contact.v1')
  assert.equal(record.sha256, hash(`${record.kind}\n${record.value}`))
  assert.equal(record.value, contactRecordText(record.contact))
  assert.notEqual(record.recordedAt.slice(0, 10), record.contact.date)
  assert.deepEqual(store.cases[0].evidence.slice(1), old.evidence)
  assert.deepEqual(store.cases[0].timeline.slice(1), old.timeline)
  assert.deepEqual(store.cases[1], second)
  assert.equal(store.extraWorkspaceField, 'retain')
  assert.equal(store.cases[0].extraCaseField, 'retain')
})

test('contact types remain compatible with every current handoff profile and index/search path', async () => {
  const storage = memoryStorage()
  for (const channel of CONTACT_CHANNELS) {
    const { store, record } = await saveContactRecord('old-case', draft({ channel, sender: '+1 415 555 0199', callbackNumber: '+1 415 555 0100', language: 'Hindi', date: '2026-01-02' }), { storage })
    for (const profile of ['victim', 'bank', 'platform', 'law']) {
      const packet = buildHandoffPacket({ item: store.cases[0], profile })
      assert.ok(packet.evidence.some((entry) => entry.id === record.id))
      const markdown = handoffToMarkdown(packet)
      assert.ok(markdown.includes('Language used (user supplied): Hindi'))
      assert.ok(markdown.includes('Note saved at: '+record.recordedAt))
      assert.match(markdown, /User statement, not independently verified/)
    }
    assert.equal(findSavedCases(store.cases, { query: 'Hindi' })[0].id, 'old-case')
    assert.equal(findSavedCases(store.cases, { query: '+1 415 555 0100' })[0].id, 'old-case')
    const index = buildPhoneIndex(store.cases)
    assert.equal(index.length, 2, 'Source date/time became a spurious phone number')
    assert.equal(index.find((entry) => entry.number === '+14155550199').recordCount, CONTACT_CHANNELS.indexOf(channel) + 1)
  }
})

test('receipt-only attachments keep their exact original-byte hash and link to the contact statement', async () => {
  const storage = memoryStorage()
  const file = new File(['Fictional voicemail bytes'], 'voicemail.txt', { type: 'text/plain' })
  const { store, record } = await saveContactRecord('old-case', draft({ file, keepScreenshot: false }), { storage })
  const attachment = store.cases[0].evidence[1]
  assert.equal(storage.writes(), 1)
  assert.equal(record.attachmentRecordId, attachment.id)
  assert.equal(attachment.relatedContactId, record.id)
  assert.equal(attachment.sha256, hash('Fictional voicemail bytes'))
  assert.equal(attachment.screenshot, undefined)
  assert.equal(attachment.sourceType, 'USER_SUPPLIED_FILE')
  assert.deepEqual(store.cases[0].evidence.slice(2), original().evidence)
})

test('failed storage, unreadable data, oversized files, and missing targets leave existing bytes untouched', async () => {
  for (const raw of ['broken', '{"cases":[null]}', '{"cases":[{"id":"old-case","evidence":[null]}]}']) {
    const storage = memoryStorage(raw)
    await assert.rejects(saveContactRecord('old-case', draft(), { storage }))
    assert.equal(storage.getItem(), raw); assert.equal(storage.writes(), 0)
  }
  const storage = memoryStorage(), before = storage.getItem()
  await assert.rejects(saveContactRecord('missing', draft(), { storage }), /case could not be found/)
  const full = { getItem: storage.getItem, setItem: () => { throw new DOMException('Full', 'QuotaExceededError') } }
  await assert.rejects(saveContactRecord('old-case', draft(), { storage: full }), { name: 'QuotaExceededError' })
  await assert.rejects(saveContactRecord('old-case', draft({ file: { name: 'too-large.png', type: 'image/png', size: 11 * 1024 * 1024 } }), { storage }), /10 MB/)
  assert.equal(storage.getItem(), before)
  assert.equal(storage.writes(), 0)
})

test('saving rereads the workspace after hashing, retaining changes made while the draft was prepared', async () => {
  const storage = memoryStorage()
  const pending = saveContactRecord('old-case', draft(), { storage })
  const concurrent = { ...original(), evidence: [{ id: 'concurrent-record', kind: 'message', value: 'Another source was added.' }, ...original().evidence] }
  storage.setItem('', JSON.stringify({ cases: [concurrent], activeCaseId: 'old-case', concurrentField: 'retain' }))
  const { store } = await pending
  assert.equal(store.concurrentField, 'retain')
  assert.deepEqual(store.cases[0].evidence.slice(1), concurrent.evidence)
})

test('a target removed during hashing is not recreated by a delayed contact save', async () => {
  const storage = memoryStorage()
  const pending = saveContactRecord('old-case', draft(), { storage })
  storage.setItem('', '{"cases":[],"activeCaseId":null}')
  await assert.rejects(pending, /case no longer exists/)
  assert.equal(storage.getItem(), '{"cases":[],"activeCaseId":null}')
})

test('clarifying a contact statement preserves its structured details, original hash, and source time', async () => {
  const storage = memoryStorage()
  const { record } = await saveContactRecord('old-case', draft({ time: '15:07', language: 'Not sure' }), { storage })
  const result = await saveStoryCorrection('old-case', record.id, 'The callback was two minutes later, not one.', { storage })
  assert.deepEqual(result.cases[0].evidence[1], record)
  assert.equal(result.cases[0].evidence[0].correctsRecordId, record.id)
  assert.equal(result.cases[0].evidence[1].contact.time, '15:07')
})

test('contact text with links, markup, and pasted Markdown fences stays inside a literal export block', async () => {
  const storage = memoryStorage()
  const value = 'Fictional message: <img src="https://example.invalid/private">\n~~~\n[Pay](https://example.invalid/pay)\n```'
  const { store, record } = await saveContactRecord('old-case', draft({ whatHappened: value }), { storage })
  const block = evidenceValueMarkdown(record)
  assert.equal(block[2], '~~~~text')
  assert.equal(block[3], record.value)
  assert.equal(block[4], '~~~~')
  assert.ok(handoffToMarkdown(buildHandoffPacket({ item: store.cases[0] })).includes(block.join('\n')))
})
