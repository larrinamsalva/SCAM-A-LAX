export const WORKSPACE_KEY = 'scamalax.state.v1'
export const BACKUP_SCHEMA = 'scamalax.workspace.v1'
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024
const MAX_CASES = 1000
const MAX_RECORDS = 50000
const states = new Set(['OBSERVED', 'SUPPORTED', 'CORRELATED', 'INFERRED', 'DISPUTED', 'UNKNOWN'])
const kinds = new Set(['message', 'email', 'phone', 'url', 'domain', 'wallet', 'payment', 'remote-access', 'file', 'note', 'other'])
const statuses = new Set(['OPEN', 'CONTAINED', 'REFERRED', 'CLOSED'])

function requireValue(condition, message) {
  if (!condition) throw new Error(message)
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function checkJson(value, depth = 0) {
  requireValue(depth <= 20, 'The backup contains data nested too deeply to restore safely.')
  if (!object(value) && !Array.isArray(value)) return
  for (const [key, child] of Object.entries(value)) {
    requireValue(!['__proto__', 'prototype', 'constructor'].includes(key), 'The backup contains an unsupported object key.')
    checkJson(child, depth + 1)
  }
}

function text(value, label, { optional = false, nonempty = false } = {}) {
  if (value === undefined && optional) return
  requireValue(typeof value === 'string' && (!nonempty || value.trim().length > 0), `${label} must be ${nonempty ? 'nonempty ' : ''}text.`)
}

function timestamp(value, label) {
  requireValue(typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)), `${label} has an invalid timestamp.`)
}

function uniqueIds(records, label) {
  const ids = new Set()
  for (const record of records) {
    requireValue(object(record), `${label} contains an invalid record.`)
    text(record.id, `${label} ID`, { nonempty: true })
    requireValue(!ids.has(record.id), `${label} contains duplicate IDs.`)
    ids.add(record.id)
  }
}

export function validateWorkspace(value) {
  requireValue(object(value) && Array.isArray(value.cases), 'This workspace does not contain a valid cases list.')
  requireValue(value.cases.length <= MAX_CASES, `A workspace can contain at most ${MAX_CASES} cases.`)
  checkJson(value)
  uniqueIds(value.cases, 'Cases')
  let totalRecords = 0
  const cases = value.cases.map((item) => {
    text(item.title, 'Case title', { nonempty: true })
    text(item.victimAlias, 'Victim alias', { optional: true })
    text(item.type, 'Scam type', { optional: true })
    text(item.notes, 'Case notes', { optional: true })
    timestamp(item.createdAt, 'Case created date')
    requireValue(statuses.has(item.status), `Case “${item.title}” has an unsupported status.`)
    requireValue(Array.isArray(item.evidence), `Case “${item.title}” needs an evidence list.`)
    requireValue(item.timeline === undefined || Array.isArray(item.timeline), 'Case timeline must be a list.')
    requireValue(item.analystLinks === undefined || Array.isArray(item.analystLinks), 'Analyst links must be a list.')
    const timeline = item.timeline || []
    const analystLinks = item.analystLinks || []
    totalRecords += item.evidence.length + timeline.length + analystLinks.length
    requireValue(totalRecords <= MAX_RECORDS, `A workspace can contain at most ${MAX_RECORDS} records.`)
    uniqueIds(item.evidence, 'Evidence')
    uniqueIds(timeline, 'Timeline')
    uniqueIds(analystLinks, 'Analyst links')
    item.evidence.forEach((record) => {
      requireValue(kinds.has(record.kind), `Evidence “${record.id}” has an unsupported kind.`)
      requireValue(states.has(record.state), `Evidence “${record.id}” has an unsupported state. No labels were changed.`)
      text(record.value, 'Evidence value')
      text(record.note, 'Evidence note', { optional: true })
      timestamp(record.recordedAt, 'Evidence recorded date')
      requireValue(typeof record.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(record.sha256), `Evidence “${record.id}” has an invalid SHA-256 receipt.`)
      if (record.kind === 'file') {
        text(record.fileName, 'File name', { nonempty: true })
        requireValue(Number.isSafeInteger(record.fileSize) && record.fileSize >= 0, 'File size must be a nonnegative integer.')
        text(record.fileType, 'File type', { optional: true })
        requireValue(record.value === '', 'File receipts must not contain original file contents.')
      }
    })
    timeline.forEach((event) => { timestamp(event.at, 'Timeline date'); text(event.text, 'Timeline text') })
    analystLinks.forEach((link) => {
      requireValue(states.has(link.state), 'An analyst link has an unsupported evidence state.')
      for (const key of ['from', 'to', 'relation']) text(link[key], `Analyst link ${key}`, { nonempty: true })
      text(link.note, 'Analyst link note', { optional: true })
      if (link.createdAt !== undefined) timestamp(link.createdAt, 'Analyst link date')
    })
    if (item.restore !== undefined) {
      requireValue(object(item.restore), 'Restore provenance must be an object.')
      text(item.restore.sourceCaseId, 'Restored source case ID', { nonempty: true })
    }
    return { ...item, notes: item.notes ?? '', timeline, analystLinks }
  })
  requireValue(value.activeCaseId === undefined || value.activeCaseId === null || typeof value.activeCaseId === 'string', 'Active case ID must be text or null.')
  return { ...value, cases, activeCaseId: cases.some((item) => item.id === value.activeCaseId) ? value.activeCaseId : null }
}

export function parseWorkspaceBackup(source) {
  requireValue(typeof source === 'string' && new TextEncoder().encode(source).length <= MAX_BACKUP_BYTES, 'Choose a JSON workspace backup no larger than 10 MB.')
  let packet
  try { packet = JSON.parse(source) } catch { throw new Error('This file is not readable JSON. Your existing cases have not changed.') }
  requireValue(object(packet) && packet.schema === BACKUP_SCHEMA, 'Choose a SCAM-A-LAX workspace backup, not a case packet or a different file format.')
  timestamp(packet.exportedAt, 'Backup export date')
  text(packet.appVersion, 'Backup app version', { optional: true })
  checkJson(packet)
  return { ...packet, store: validateWorkspace(packet.store) }
}

// Stable object-key ordering makes equivalent exports compare equally.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!object(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
}

function fingerprint(item) {
  const { restore, ...original } = item
  return JSON.stringify(stable({ ...original, id: restore?.sourceCaseId || item.id }))
}

export function previewWorkspaceRestore(currentValue, backup) {
  const current = validateWorkspace(currentValue)
  const incoming = validateWorkspace(backup.store)
  const fingerprints = new Set(current.cases.map(fingerprint))
  const currentIds = new Set(current.cases.map((item) => item.id))
  return incoming.cases.map((item) => ({
    id: item.id,
    title: item.title,
    evidenceCount: item.evidence.length,
    status: fingerprints.has(fingerprint(item)) ? 'duplicate' : currentIds.has(item.id) ? 'copy' : 'new',
  }))
}

export function mergeWorkspaceRestore(currentValue, backup, selectedIds, createId = () => `case-restored-${crypto.randomUUID()}`) {
  const current = validateWorkspace(currentValue)
  const incoming = validateWorkspace(backup.store)
  requireValue(Array.isArray(selectedIds), 'Choose cases to restore first.')
  const selected = new Set(selectedIds)
  const incomingIds = new Set(incoming.cases.map((item) => item.id))
  requireValue([...selected].every((id) => incomingIds.has(id)), 'The restore selection does not match this backup.')
  const fingerprints = new Set(current.cases.map(fingerprint))
  const usedIds = new Set(current.cases.map((item) => item.id))
  const added = []
  let skipped = 0
  let copies = 0
  incoming.cases.forEach((item) => {
    if (!selected.has(item.id)) return
    const key = fingerprint(item)
    if (fingerprints.has(key)) { skipped++; return }
    let imported = item
    if (usedIds.has(item.id)) {
      const id = createId()
      requireValue(typeof id === 'string' && id && !usedIds.has(id), 'Could not create a unique restored case ID. Nothing was saved.')
      imported = { ...item, id, restore: { ...item.restore, sourceCaseId: item.restore?.sourceCaseId || item.id } }
      copies++
    }
    usedIds.add(imported.id)
    fingerprints.add(key)
    added.push(imported)
  })
  const preferred = current.activeCaseId || added.find((item) => (item.restore?.sourceCaseId || item.id) === incoming.activeCaseId)?.id || added[0]?.id || null
  const store = validateWorkspace({ ...current, cases: [...current.cases, ...added], activeCaseId: preferred })
  return { store, added: added.length, copies, skipped }
}

export function readWorkspace(storage) {
  let raw
  try { raw = storage.getItem(WORKSPACE_KEY) }
  catch { throw new Error('Saved cases cannot be accessed in this browser. Allow browser storage before saving or restoring cases.') }
  if (raw === null) return { store: { cases: [], activeCaseId: null }, raw }
  let parsed
  try { parsed = JSON.parse(raw) } catch { throw new Error('Saved case data is damaged. It has been left untouched. Download the saved data before clearing it.') }
  try { return { store: validateWorkspace(parsed), raw } }
  catch { throw new Error('Saved case data could not be loaded safely. It has been left untouched. Download the saved data before clearing it.') }
}

export function saveWorkspace(storage, expectedRaw, value) {
  const store = validateWorkspace(value)
  requireValue(storage.getItem(WORKSPACE_KEY) === expectedRaw, 'Saved cases changed in another tab. Reload My cases before editing again.')
  const raw = JSON.stringify(store)
  try { storage.setItem(WORKSPACE_KEY, raw) }
  catch { throw new Error('The browser could not save this change. Your existing saved cases have not been replaced. Download a backup before freeing browser storage.') }
  return { store, raw }
}

export function restoreWorkspace(storage, backup, selectedIds, createId) {
  // Read the latest saved cases at confirmation, including changes in other tabs.
  const { store: current, raw } = readWorkspace(storage)
  const result = mergeWorkspaceRestore(current, backup, selectedIds, createId)
  if (!result.added) return { ...result, raw }
  requireValue(storage.getItem(WORKSPACE_KEY) === raw, 'Saved cases changed while preparing the restore. Preview the backup again.')
  const serialized = JSON.stringify(result.store)
  try { storage.setItem(WORKSPACE_KEY, serialized) }
  catch { throw new Error('The browser could not save this restore. Your existing saved cases have not been replaced. Try fewer cases or free space after downloading a backup.') }
  return { ...result, raw: serialized }
}
