import { extractEntitiesFromEvidence } from './intelligence.js'

export function normalizePhoneQuery(input) {
  if (typeof input !== 'string' || input.length > 80) return null
  const value = input.trim()
  if (!/^\+?[\d\s().-]+$/.test(value)) return null
  const phone = extractEntitiesFromEvidence([{ id: 'query', value }]).find((entity) => entity.type === 'phone')
  return phone?.value || null
}

export function buildPhoneIndex(cases = []) {
  const index = new Map()
  if (!Array.isArray(cases)) return []
  for (const item of cases) {
    if (!item || typeof item.id !== 'string' || !Array.isArray(item.evidence)) continue
    const evidence = item.evidence.filter((record) => record && typeof record.id === 'string')
    const searchable = evidence.map((record) => ({
      id: record.id,
      value: typeof record.value === 'string' ? record.value : '',
      note: typeof record.note === 'string' ? record.note : '',
      fileName: typeof record.fileName === 'string' ? record.fileName : '',
    }))
    for (const phone of extractEntitiesFromEvidence(searchable).filter((entity) => entity.type === 'phone')) {
      const entry = index.get(phone.value) || { number: phone.value, cases: [], recordCount: 0 }
      const records = evidence.filter((record) => phone.sourceIds.includes(record.id))
      entry.cases.push({ caseId: item.id, title: item.title || 'Untitled case', records })
      entry.recordCount += records.length
      index.set(phone.value, entry)
    }
  }
  return [...index.values()].sort((a, b) => b.cases.length - a.cases.length || b.recordCount - a.recordCount || a.number.localeCompare(b.number))
}
