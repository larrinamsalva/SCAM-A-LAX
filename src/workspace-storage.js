export const WORKSPACE_KEY = 'scamalax.state.v1'

export function readWorkspace(storage = globalThis.localStorage) {
  const raw = storage.getItem(WORKSPACE_KEY)
  if (!raw) return { cases: [], activeCaseId: null }
  const store = JSON.parse(raw)
  if (!store || !Array.isArray(store.cases)) throw new Error('Saved cases could not be read. Existing browser data has not been changed.')
  const ids = new Set()
  for (const item of store.cases) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
      (item.evidence !== undefined && (!Array.isArray(item.evidence) || item.evidence.some((record) => !record || typeof record !== 'object' || Array.isArray(record))))) {
      throw new Error('Saved cases contain unreadable records. Existing browser data has not been changed.')
    }
    ids.add(item.id)
  }
  return store
}

export function writeWorkspace(updater, storage = globalThis.localStorage) {
  const next = updater(readWorkspace(storage))
  storage.setItem(WORKSPACE_KEY, JSON.stringify(next))
  return next
}
