import { readWorkspace, writeWorkspace } from './workspace-storage.js'
import { isScreenshotFile, prepareScreenshot, saveScreenshot, removeScreenshot, SCREENSHOT_LIMIT } from './screenshots.js'

export const STORY_LIMIT = 20000
export const CONTACT_LIMIT = 5000
export const CASE_CATEGORIES = ['Not sure', 'Shopping or marketplace', 'Bank or payment impersonation', 'Job offer', 'Romance or friendship', 'Technical support', 'Investment or cryptocurrency', 'Other']

export function emptyCaseDraft(open = true) {
  return { open, step: 0, name: '', category: 'Not sure', incidentDate: '', loss: '', story: '', contacts: '', file: null, keepScreenshot: true }
}

export function hasCaseDraft(draft) {
  return Boolean(draft && (draft.name || draft.story || draft.contacts || draft.incidentDate || draft.loss || draft.file || draft.category !== 'Not sure'))
}

function boundedText(value, limit, label) {
  if (typeof value !== 'string' || value.length > limit) throw new Error(`${label} must be text of at most ${limit.toLocaleString()} characters.`)
  return value.trim()
}

export function reviewCaseDraft(draft) {
  const name = boundedText(draft.name, 160, 'Case name')
  const story = boundedText(draft.story, STORY_LIMIT, 'Your story')
  const contacts = boundedText(draft.contacts, CONTACT_LIMIT, 'Contact details')
  if (!story) throw new Error('Describe what happened before saving your case.')
  if (!CASE_CATEGORIES.includes(draft.category)) throw new Error('Choose a category, or Not sure.')
  const incidentDate = boundedText(draft.incidentDate, 10, 'Incident date')
  if (incidentDate) {
    const parsed = new Date(`${incidentDate}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incidentDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== incidentDate) throw new Error('Enter a valid incident date, or leave it blank.')
  }
  const loss = boundedText(draft.loss, 16, 'Approximate loss')
  let reportedLoss
  if (loss) {
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(loss)) throw new Error('Enter a non-negative USD amount with at most two decimal places, or leave it blank.')
    const [whole, fraction = ''] = loss.split('.')
    reportedLoss = { amount: `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`, currency: 'USD', approximate: true }
  }
  return { name, story, contacts, category: draft.category, incidentDate, reportedLoss }
}

export function validateCaseFile(file, keepScreenshot = true) {
  if (!file) return
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a file smaller than 25 MB. Nothing has been saved.')
  if (keepScreenshot && isScreenshotFile(file) && file.size > SCREENSHOT_LIMIT) throw new Error('Choose a screenshot smaller than 10 MB, or keep only its receipt. Nothing has been saved.')
}

export async function recordHash(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const id = (prefix) => `${prefix}-${crypto.randomUUID()}`

export async function saveCaseWithStory(draft, { storage = globalThis.localStorage } = {}) {
  const details = reviewCaseDraft(draft)
  validateCaseFile(draft.file, draft.keepScreenshot)
  // Refuse to write over unreadable data before creating any attachment.
  readWorkspace(storage)
  const createdAt = new Date().toISOString()
  const story = {
    id: id('ev'), kind: 'note', state: 'OBSERVED', sourceType: 'USER_STATEMENT', value: details.story,
    note: 'User statement; the account has not been independently verified.', recordedAt: createdAt,
    sha256: await recordHash(`note\n${details.story}`),
  }
  const evidence = [story]
  if (details.contacts) evidence.push({
    id: id('ev'), kind: 'note', state: 'OBSERVED', sourceType: 'USER_STATEMENT', value: details.contacts,
    note: 'Contact details supplied by the user; ownership and involvement are unverified.', recordedAt: createdAt,
    sha256: await recordHash(`note\n${details.contacts}`),
  })
  let image
  let imageSaved = false
  try {
    if (draft.file) {
      const bytes = await draft.file.arrayBuffer()
      const hash = await recordHash(bytes)
      const fileRecord = {
        id: id('ev'), kind: 'file', state: 'OBSERVED', sourceType: 'USER_SUPPLIED_FILE', value: '',
        note: 'Original file supplied by the user. Its hash identifies the bytes, not the truth of a claim.',
        recordedAt: createdAt, sha256: hash, fileName: draft.file.name, fileSize: draft.file.size, fileType: draft.file.type,
      }
      if (draft.keepScreenshot && isScreenshotFile(draft.file)) {
        image = await prepareScreenshot(draft.file, bytes, hash)
        await saveScreenshot(image)
        imageSaved = true
        fileRecord.screenshot = { id: image.id, type: image.type, width: image.width, height: image.height }
        fileRecord.fileType = image.type
      }
      evidence.push(fileRecord)
    }
    const item = {
      id: id('case'), title: details.name || `${details.category === 'Not sure' ? 'Scam case' : details.category} — ${new Date(createdAt).toLocaleDateString()}`,
      victimAlias: '', type: details.category, status: 'OPEN', createdAt, notes: '', evidence, analystLinks: [],
      ...(details.incidentDate ? { incidentDate: details.incidentDate } : {}),
      ...(details.reportedLoss ? { reportedLoss: details.reportedLoss } : {}),
      timeline: [{ id: id('event'), at: createdAt, text: `Case created with the user's story and ${evidence.length} saved record${evidence.length === 1 ? '' : 's'}.` }],
    }
    // The case and every record enter localStorage in one synchronous write.
    const store = writeWorkspace((current) => ({ ...current, cases: [item, ...current.cases], activeCaseId: item.id }), storage)
    return { store, item }
  } catch (error) {
    if (imageSaved) {
      try { await removeScreenshot(image.id) }
      catch { throw new Error('The case was not saved. A temporary screenshot copy could not be removed; keep your original and try again before clearing local data.') }
    }
    throw error
  }
}

export async function saveStoryCorrection(caseId, recordId, value, { storage = globalThis.localStorage } = {}) {
  const story = boundedText(value, STORY_LIMIT, 'Correction')
  if (!story) throw new Error('Enter a correction or clarification before saving.')
  const recordedAt = new Date().toISOString()
  const record = {
    id: id('ev'), kind: 'note', state: 'OBSERVED', sourceType: 'USER_STATEMENT', correctsRecordId: recordId, value: story,
    note: `User correction or clarification of record ${recordId}. The original record is retained; neither statement is independently verified.`,
    recordedAt, sha256: await recordHash(`note\n${story}`),
  }
  return writeWorkspace((current) => {
    const item = current.cases.find((entry) => entry.id === caseId)
    if (!item?.evidence?.some((entry) => entry.id === recordId)) throw new Error('The source record could not be found. No correction was saved.')
    return { ...current, cases: current.cases.map((entry) => entry.id !== caseId ? entry : {
      ...entry, evidence: [record, ...entry.evidence],
      timeline: [{ id: id('event'), at: recordedAt, text: `A user clarification was added for record ${recordId}; the original was kept.` }, ...(entry.timeline || [])],
    }) }
  }, storage)
}

export function findSavedCases(cases, { query = '', status = 'all', sort = 'newest' } = {}) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const filtered = cases.filter((item) => {
    if (status !== 'all' && item.status !== status) return false
    const haystack = [item.id, item.title, item.type, item.notes, item.incidentDate, item.reportedLoss?.amount,
      ...(item.evidence || []).flatMap((record) => [record.id, record.value, record.note, record.fileName])].filter((value) => typeof value === 'string').join(' ').toLocaleLowerCase()
    return words.every((word) => haystack.includes(word))
  })
  return filtered.sort((a, b) => sort === 'title' ? (a.title || '').localeCompare(b.title || '') :
    sort === 'oldest' ? (a.createdAt || '').localeCompare(b.createdAt || '') : (b.createdAt || '').localeCompare(a.createdAt || ''))
}
