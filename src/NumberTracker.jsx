import { useEffect, useMemo, useRef, useState } from 'react'
import { buildPhoneIndex, normalizePhoneQuery } from './phone-tracker.js'

const STORAGE_KEY = 'scamalax.state.v1'
const storageMessage = 'Saved cases could not be read in this browser. The tracker has not changed your data. Keep any backup you have.'

function readWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { store: { cases: [] }, error: '' }
    const store = JSON.parse(raw)
    if (!store || !Array.isArray(store.cases)) throw new Error('Invalid workspace')
    return { store, error: '' }
  } catch {
    return { store: null, error: storageMessage }
  }
}

function excerpt(record) {
  return [record.value, record.note, record.fileName].filter((value) => typeof value === 'string' && value).join(' · ').slice(0, 500)
}

export default function NumberTracker({ go }) {
  const [workspace, setWorkspace] = useState(readWorkspace)
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(null)
  const [error, setError] = useState('')
  const resultRef = useRef(null)
  const index = useMemo(() => buildPhoneIndex(workspace.store?.cases), [workspace])
  const match = index.find((entry) => entry.number === searched)

  useEffect(() => {
    const refresh = () => setWorkspace(readWorkspace())
    const onStorage = (event) => { if (event.key === STORAGE_KEY || event.key === null) refresh() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refresh) }
  }, [])

  const lookup = (value) => {
    const number = normalizePhoneQuery(value)
    setWorkspace(readWorkspace())
    setError(number ? '' : 'Enter one phone number with 10–15 digits. Use digits, spaces, parentheses, dots or dashes, and an optional leading +.')
    setSearched(number)
    if (number) requestAnimationFrame(() => resultRef.current?.focus())
  }

  const openCase = (caseId) => {
    const current = readWorkspace()
    if (current.error) { setWorkspace(current); return }
    if (!current.store.cases.some((item) => item?.id === caseId)) {
      setWorkspace(current)
      setError('That case is no longer in this workspace. Refresh saved cases to check the current list.')
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current.store, activeCaseId: caseId }))
      go('cases')
    } catch {
      setError('The case could not be opened because browser storage is unavailable. Your records have not been changed.')
    }
  }

  return <div className="ed-narrow">
    <div className="ed-page-title"><span className="ed-eyebrow">YOUR LOCAL NUMBER TRACKER</span><h1>Look up a phone number.</h1><p>Find numbers mentioned in your saved case records. This searches the cases in this browser, not public scam reports.</p></div>
    <section className="ed-card ed-number-form">
      <form onSubmit={(event) => { event.preventDefault(); lookup(query) }}>
        <label htmlFor="tracked-phone">Phone number</label>
        <p id="tracked-phone-help" className="ed-small">Use 10–15 digits. Keep the country-code format used in your record: +country code and a local number are matched separately.</p>
        <input id="tracked-phone" type="tel" maxLength={80} value={query} onChange={(event) => { setQuery(event.target.value); setSearched(null); setError('') }} placeholder="For example: +1 (415) 555-0199" autoComplete="off" aria-describedby="tracked-phone-help" required />
        <div className="ed-button-row"><button type="submit" className="ed-primary" disabled={!query.trim() || Boolean(workspace.error)}>Search saved cases</button><button type="button" className="ed-secondary" onClick={() => setWorkspace(readWorkspace())}>Refresh saved cases</button></div>
      </form>
      {error && <p className="ed-number-error" role="alert">{error}</p>}
      {workspace.error && <p className="ed-number-error" role="alert">{workspace.error}</p>}
    </section>
    {searched && !workspace.error && <section className="ed-card ed-number-results" ref={resultRef} tabIndex={-1} aria-labelledby="phone-result-title">
      <span className="ed-eyebrow">{match ? 'LOCAL RECORD MATCH' : 'NO LOCAL MATCH'}</span>
      <h2 id="phone-result-title">{match ? `Found in ${match.cases.length} saved ${match.cases.length === 1 ? 'case' : 'cases'}` : 'No match in your saved cases.'}</h2>
      <p><strong>{searched}</strong></p>
      <p>{match ? 'A saved mention is a lead to review, not proof of who called or whether the number belongs to a scammer.' : 'This does not tell you whether the number is safe. Public scam reports are not searched.'}</p>
      {match?.cases.map((item) => <article className="ed-phone-case" key={item.caseId} aria-label={item.title}>
        <h3>{item.title}</h3><p className="ed-small">{item.records.length} matching {item.records.length === 1 ? 'record' : 'records'}</p>
        <ul className="ed-phone-records">{item.records.map((record) => <li key={record.id}><div><span>{record.kind || 'record'}</span><strong>{record.state || 'UNKNOWN'}</strong></div><p>{excerpt(record)}</p></li>)}</ul>
        <button type="button" className="ed-secondary" onClick={() => openCase(item.caseId)}>Open this case</button>
      </article>)}
      {!match && <p className="ed-small">To track a number, open My cases, select your case, choose Kind → phone in Scam Ledger, enter the number, and select Save record.</p>}
    </section>}
    {!workspace.error && <section className="ed-card">
      <div className="ed-section-title"><div><span className="ed-eyebrow">SAVED NUMBER INDEX</span><h2>Numbers in your saved cases</h2></div><span className="ed-small">{index.length} {index.length === 1 ? 'number' : 'numbers'}</span></div>
      {index.length ? <ul className="ed-phone-index">{index.map((entry) => <li key={entry.number}><button type="button" aria-label={`Look up ${entry.number}`} onClick={() => { setQuery(entry.number); lookup(entry.number) }}><strong>{entry.number}</strong><span>{entry.cases.length} {entry.cases.length === 1 ? 'case' : 'cases'} · {entry.recordCount} {entry.recordCount === 1 ? 'record' : 'records'}</span><span aria-hidden="true">→</span></button></li>)}</ul> : <p>No phone numbers are listed yet. Save a phone number as a record in My cases to track it here.</p>}
      <div className="ed-button-row"><button type="button" className="ed-secondary" onClick={() => go('cases')}>Open My cases</button><button type="button" className="ed-secondary" onClick={() => go('guide')}>Show me the steps</button></div>
    </section>}
  </div>
}
