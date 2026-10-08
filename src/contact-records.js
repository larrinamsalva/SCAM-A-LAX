import { readWorkspace, writeWorkspace } from './workspace-storage.js'
import { recordHash, STORY_LIMIT, validateCaseFile } from './case-workflow.js'
import { isScreenshotFile, prepareScreenshot, saveScreenshot, removeScreenshot } from './screenshots.js'

export const CONTACT_CHANNELS = ['Phone call', 'Text message', 'Email', 'Chat or social message', 'Voicemail', 'Other']
export const CONTACT_BASES = ['My recollection', 'Copied from an original message', 'Notes from call history', 'Transcript from an existing recording', 'Other / not sure']
export const CONTACT_BEHAVIORS = [
  { key: 'keptOnPhone', label: 'Kept you on the phone through a purchase or withdrawal?' },
  { key: 'quickCallback', label: 'Called back quickly and pressured you to continue?' },
  { key: 'coachedCashier', label: 'Told you a cover story for the cashier or bank?' },
]
export const CONTACT_ANSWERS = { '': 'Not answered', yes: 'Yes', no: 'No', unsure: 'Not sure' }
const TEXT_FIELDS = {
  date: 10, time: 5, timeZone: 80, sender: 500, callbackNumber: 500,
  claimedIdentity: 300, language: 160, location: 500, paymentRequest: 1000,
  whatHappened: STORY_LIMIT, actionsTaken: 3000,
}

export function emptyContactDraft() {
  return {
    channel: CONTACT_CHANNELS[0], basis: CONTACT_BASES[0],
    ...Object.fromEntries(Object.keys(TEXT_FIELDS).map((key) => [key, ''])),
    ...Object.fromEntries(CONTACT_BEHAVIORS.map(({ key }) => [key, ''])),
    file: null, keepScreenshot: true,
  }
}

export function hasContactDraft(draft) {
  return Boolean(draft && (draft.file || draft.channel !== CONTACT_CHANNELS[0] || draft.basis !== CONTACT_BASES[0] ||
    [...Object.keys(TEXT_FIELDS), ...CONTACT_BEHAVIORS.map(({ key }) => key)].some((key) => draft[key])))
}

export function reviewContactDraft(draft) {
  if (!draft || !CONTACT_CHANNELS.includes(draft.channel) || !CONTACT_BASES.includes(draft.basis)) throw new Error('Choose a contact type and how you know what happened.')
  const details = { schema: 'scamalax.contact.v1', channel: draft.channel, basis: draft.basis }
  for (const [key, limit] of Object.entries(TEXT_FIELDS)) {
    if (typeof draft[key] !== 'string' || draft[key].length > limit) throw new Error('A contact field is invalid or too long. Keep your original and shorten the note.')
    details[key] = draft[key].trim()
  }
  if (!details.whatHappened) throw new Error('Write what was said or sent before saving the contact record.')
  if (details.date) {
    const date = new Date(`${details.date}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(details.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== details.date) throw new Error('Enter a valid contact date, or leave it blank.')
  }
  if (details.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(details.time)) throw new Error('Enter a valid contact time, or leave it blank.')
  for (const { key } of CONTACT_BEHAVIORS) {
    if (!Object.hasOwn(CONTACT_ANSWERS, draft[key])) throw new Error('Choose Yes, No, Not sure, or Not answered for the contact questions.')
    details[key] = draft[key]
  }
  return details
}

// Keep every field in the labeled text so existing search, identifier tracking,
// Markdown exports, and the kind + value integrity receipt cover the same facts.
export function contactRecordText(details) {
  return [
    `Contact type: ${details.channel}`,
    `Contact date (user supplied): ${details.date || 'Not provided'}`,
    `Contact time (user supplied): ${details.time || 'Not provided'}`,
    `Time zone (user supplied): ${details.timeZone || 'Not provided'}`,
    `Basis of this note: ${details.basis}`,
    `Displayed number, email, or sender (unverified): ${details.sender || 'Not provided'}`,
    `Callback number supplied (unverified): ${details.callbackNumber || 'Not provided'}`,
    `Claimed name or organization (unverified): ${details.claimedIdentity || 'Not provided'}`,
    `Language used (user supplied): ${details.language || 'Not provided'}`,
    `Store, bank, or destination described: ${details.location || 'Not provided'}`,
    `Payment requested: ${details.paymentRequest || 'Not provided'}`,
    ...CONTACT_BEHAVIORS.map(({ key, label }) => `${label} ${CONTACT_ANSWERS[details[key]]}`),
    '', 'What was said or sent:', details.whatHappened,
    '', 'What I did next:', details.actionsTaken || 'Not provided',
  ].join('\n')
}

export async function saveContactRecord(caseId, draft, { storage = globalThis.localStorage } = {}) {
  const details = reviewContactDraft(draft)
  validateCaseFile(draft.file, draft.keepScreenshot)
  if (!readWorkspace(storage).cases.some((item) => item.id === caseId)) throw new Error('The case could not be found. Nothing was saved.')
  const recordedAt = new Date().toISOString()
  const kind = details.channel === 'Email' ? 'email' : ['Text message', 'Chat or social message'].includes(details.channel) ? 'message' : 'note'
  const value = contactRecordText(details)
  const record = {
    id: `ev-${crypto.randomUUID()}`, kind, state: 'OBSERVED', sourceType: 'USER_STATEMENT',
    value, contact: details, recordedAt, sha256: await recordHash(`${kind}\n${value}`),
    note: 'User-entered contact note; not independently verified. Contact time is supplied by the user. SHA-256 covers the kind and labeled record text, not the truth of a claim.',
  }
  const added = [record]
  let image, imageSaved = false
  try {
    if (draft.file) {
      const bytes = await draft.file.arrayBuffer()
      const sha256 = await recordHash(bytes)
      const attachment = {
        id: `ev-${crypto.randomUUID()}`, kind: 'file', state: 'OBSERVED', sourceType: 'USER_SUPPLIED_FILE',
        value: '', relatedContactId: record.id, recordedAt, sha256,
        fileName: draft.file.name, fileSize: draft.file.size, fileType: draft.file.type,
        note: `User-supplied file for contact record ${record.id}. Its receipt identifies the original bytes, not the truth of a claim.`,
      }
      if (draft.keepScreenshot && isScreenshotFile(draft.file)) {
        image = await prepareScreenshot(draft.file, bytes, sha256)
        await saveScreenshot(image)
        imageSaved = true
        attachment.screenshot = { id: image.id, type: image.type, width: image.width, height: image.height }
        attachment.fileType = image.type
      }
      record.attachmentRecordId = attachment.id
      added.push(attachment)
    }
    const store = writeWorkspace((current) => {
      if (!current.cases.some((item) => item.id === caseId)) throw new Error('The case no longer exists. Nothing was saved.')
      return { ...current, cases: current.cases.map((item) => item.id !== caseId ? item : {
        ...item, evidence: [...added, ...(item.evidence || [])],
        timeline: [{ id: `event-${crypto.randomUUID()}`, at: recordedAt, text: `${details.channel} contact note saved. Contact date and time are user supplied.` }, ...(item.timeline || [])],
      }) }
    }, storage)
    return { store, record }
  } catch (error) {
    if (imageSaved) {
      try { await removeScreenshot(image.id) }
      catch { throw new Error('The contact record was not saved. A temporary screenshot could not be removed. Keep your original file and retry before clearing browser data.') }
    }
    throw error
  }
}
