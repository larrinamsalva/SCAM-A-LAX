import { useEffect, useMemo, useRef, useState } from 'react'
import { entityLabel, extractEntitiesFromEvidence, getCrossCaseMatches } from './intelligence'
import { analyzeMessage } from './scamcheck.js'
import { VERSION } from './version.js'
import RestoreBackup from './RestoreBackup.jsx'
import { BACKUP_SCHEMA, WORKSPACE_KEY, readWorkspace, restoreWorkspace, saveWorkspace } from './workspace.js'

const evidenceStates = ['OBSERVED', 'SUPPORTED', 'CORRELATED', 'INFERRED', 'DISPUTED', 'UNKNOWN']
const evidenceKinds = ['message', 'email', 'phone', 'url', 'domain', 'wallet', 'payment', 'remote-access', 'file', 'note', 'other']

const rescueSteps = [
  'Stop sending money, gift cards, crypto, or payment codes.',
  'Hang up or stop replying. Do not use contact details supplied by the suspected scammer.',
  'Disconnect remote-access software and remove unattended-access permissions.',
  'Contact your bank, card issuer, exchange, or payment service through a trusted official channel.',
  'From a trusted device, change exposed passwords and enable multi-factor authentication.',
  'Preserve messages, receipts, transaction IDs, phone numbers, URLs, and screenshots.',
  'Report the incident to the relevant platform and appropriate authorities for your location.',
]

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeCase(item) {
  return {
    ...item,
    notes: item.notes || '',
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    timeline: Array.isArray(item.timeline) ? item.timeline : [],
    analystLinks: Array.isArray(item.analystLinks) ? item.analystLinks : [],
  }
}

function loadWorkspace() {
  try {
    return { ...readWorkspace(localStorage), error: '' }
  } catch (cause) {
    let raw = null
    try { raw = localStorage.getItem(WORKSPACE_KEY) } catch { /* Storage is unavailable. */ }
    return { store: { cases: [], activeCaseId: null }, raw, error: cause.message }
  }
}

async function sha256(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function download(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function short(value, max = 28) {
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function caseToMarkdown(item, entities, crossCaseMatches) {
  const lines = [
    '# SCAM-A-LAX Case Packet',
    '',
    `- **Schema:** scamalax.case.v2`,
    `- **Case ID:** ${item.id}`,
    `- **Title:** ${item.title}`,
    `- **Victim alias:** ${item.victimAlias || 'Not provided'}`,
    `- **Scam type:** ${item.type || 'Unknown'}`,
    `- **Status:** ${item.status}`,
    `- **Created:** ${item.createdAt}`,
    `- **Exported:** ${nowIso()}`,
    '',
    '> Defensive evidence packet. Extracted entities and cross-case correlations are investigative aids, not proof of identity or wrongdoing.',
    '',
    '## Entity index',
    '',
  ]

  if (!entities.length) lines.push('_No entities extracted._')
  entities.forEach((entity) => {
    lines.push(`- **${entityLabel(entity.type)}:** ${entity.value} — ${entity.sourceIds.length} source record(s), ${entity.occurrences} occurrence(s)`)
  })

  lines.push('', '## Cross-case correlations', '')
  if (!crossCaseMatches.length) lines.push('_No shared non-generic entities found across local cases._')
  crossCaseMatches.forEach((match) => {
    lines.push(`- **${entityLabel(match.type)}:** ${match.value} — also appears in ${match.cases.map((entry) => entry.title).join(', ')}`)
  })

  lines.push('', '## Analyst links', '')
  if (!item.analystLinks.length) lines.push('_No analyst-authored links._')
  item.analystLinks.forEach((link) => {
    lines.push(`- **${link.state}:** ${link.from} --${link.relation}--> ${link.to}${link.note ? ` — ${link.note}` : ''}`)
  })

  lines.push('', '## Evidence manifest', '')
  if (!item.evidence.length) lines.push('_No evidence recorded._')
  item.evidence.forEach((ev, index) => {
    lines.push(`### ${index + 1}. ${ev.kind.toUpperCase()} — ${ev.state}`)
    lines.push(`- **Evidence ID:** ${ev.id}`)
    lines.push(`- **Recorded:** ${ev.recordedAt}`)
    lines.push(`- **SHA-256:** \`${ev.sha256}\``)
    if (ev.fileName) lines.push(`- **File:** ${ev.fileName} (${ev.fileSize} bytes, ${ev.fileType || 'unknown type'})`)
    if (ev.value) lines.push(`- **Value:** ${ev.value}`)
    if (ev.note) lines.push(`- **Note:** ${ev.note}`)
    lines.push('')
  })

  lines.push('## Timeline', '')
  if (!item.timeline.length) lines.push('_No timeline events._')
  item.timeline.forEach((event) => lines.push(`- **${event.at}** — ${event.text}`))
  lines.push('', '## Notes', '', item.notes || '_No case notes._', '')
  return lines.join('\n')
}

function RelationshipGraph({ item, entities }) {
  const evidence = item.evidence.slice(0, 10)
  const graphEntities = entities.slice(0, 16)
  const width = 900
  const height = 520
  const cx = width / 2
  const cy = height / 2
  const evidenceRadius = 130
  const entityRadius = 220

  const evidenceNodes = evidence.map((ev, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(evidence.length, 1) - Math.PI / 2
    return { ...ev, x: cx + Math.cos(angle) * evidenceRadius, y: cy + Math.sin(angle) * evidenceRadius }
  })

  const entityNodes = graphEntities.map((entity, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(graphEntities.length, 1) - Math.PI / 2
    return { ...entity, x: cx + Math.cos(angle) * entityRadius, y: cy + Math.sin(angle) * entityRadius }
  })

  const evidenceById = new Map(evidenceNodes.map((node) => [node.id, node]))
  const entityById = new Map(entityNodes.map((node) => [node.id, node]))

  return (
    <div className="graph-wrap">
      {!evidence.length && <p className="muted empty">Add evidence to generate the relationship graph.</p>}
      {evidence.length > 0 && (
        <svg className="intel-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Case evidence and extracted entity relationship graph">
          <g className="graph-lines">
            {evidenceNodes.map((ev) => <line key={`case-${ev.id}`} x1={cx} y1={cy} x2={ev.x} y2={ev.y} />)}
            {entityNodes.flatMap((entity) => entity.sourceIds.map((sourceId) => {
              const source = evidenceById.get(sourceId)
              if (!source) return null
              return <line key={`${sourceId}-${entity.id}`} className="entity-edge" x1={source.x} y1={source.y} x2={entity.x} y2={entity.y} />
            }))}
            {item.analystLinks.map((link) => {
              const from = entityById.get(link.from)
              const to = entityById.get(link.to)
              if (!from || !to) return null
              return <line key={link.id} className="analyst-edge" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
            })}
          </g>

          <g className="case-node">
            <circle cx={cx} cy={cy} r="54" />
            <text x={cx} y={cy - 5} textAnchor="middle">CASE</text>
            <text x={cx} y={cy + 16} textAnchor="middle" className="node-sub">{short(item.title, 16)}</text>
          </g>

          {evidenceNodes.map((ev, index) => (
            <g className="evidence-node" key={ev.id} transform={`translate(${ev.x}, ${ev.y})`}>
              <circle r="28" />
              <text y="-2" textAnchor="middle">E{index + 1}</text>
              <text y="15" textAnchor="middle" className="node-sub">{short(ev.kind, 10)}</text>
            </g>
          ))}

          {entityNodes.map((entity) => (
            <g className="entity-node" key={entity.id} transform={`translate(${entity.x}, ${entity.y})`}>
              <rect x="-62" y="-24" width="124" height="48" rx="10" />
              <text y="-5" textAnchor="middle">{entityLabel(entity.type)}</text>
              <text y="12" textAnchor="middle" className="node-sub">{short(entity.value, 18)}</text>
            </g>
          ))}
        </svg>
      )}
      {(item.evidence.length > evidence.length || entities.length > graphEntities.length) && (
        <p className="graph-limit">Graph view shows the first {evidence.length} evidence records and {graphEntities.length} extracted entities. The full index remains available below and in exports.</p>
      )}
    </div>
  )
}

function AppV2() {
  const [initial] = useState(loadWorkspace)
  const [store, setStore] = useState(initial.store)
  const [persistenceError, setPersistenceError] = useState(initial.error)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const storeRef = useRef(initial.store)
  const savedRawRef = useRef(initial.raw)
  const loadErrorRef = useRef(initial.error)
  const [view, setView] = useState('ledger')
  const [notice, setNotice] = useState('')
  const [rescueChecks, setRescueChecks] = useState({})
  const [scanText, setScanText] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [entityFilter, setEntityFilter] = useState('all')
  const fileRef = useRef(null)
  const restoreButtonRef = useRef(null)

  const activeCase = useMemo(
    () => store.cases.find((item) => item.id === store.activeCaseId) || null,
    [store],
  )

  const entities = useMemo(
    () => extractEntitiesFromEvidence(activeCase?.evidence || []),
    [activeCase?.evidence],
  )

  const crossCaseMatches = useMemo(
    () => activeCase ? getCrossCaseMatches(store.cases, activeCase.id) : [],
    [store.cases, activeCase],
  )

  const filteredEntities = useMemo(
    () => entityFilter === 'all' ? entities : entities.filter((entity) => entity.type === entityFilter),
    [entities, entityFilter],
  )

  const entityTypesPresent = useMemo(
    () => [...new Set(entities.map((entity) => entity.type))],
    [entities],
  )

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(''), 3400)
    return () => clearTimeout(timer)
  }, [notice])

  const updateWorkspace = (updater) => {
    try {
      if (loadErrorRef.current) throw new Error(loadErrorRef.current)
      const result = saveWorkspace(localStorage, savedRawRef.current, updater(storeRef.current))
      storeRef.current = result.store
      savedRawRef.current = result.raw
      setStore(result.store)
      setPersistenceError('')
      return true
    } catch (cause) {
      setPersistenceError(cause.message || 'This change could not be saved.')
      setNotice('')
      return false
    }
  }

  const patchCase = (caseId, updater) => (
    updateWorkspace((current) => ({
      ...current,
      cases: current.cases.map((item) => (item.id === caseId ? normalizeCase(updater(normalizeCase(item))) : item)),
    }))
  )

  const createCase = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const title = String(data.get('title') || '').trim()
    if (!title) return
    const createdAt = nowIso()
    const item = {
      id: uid('case'),
      title,
      victimAlias: String(data.get('victimAlias') || '').trim(),
      type: String(data.get('type') || '').trim(),
      status: 'OPEN',
      createdAt,
      notes: '',
      evidence: [],
      analystLinks: [],
      timeline: [{ id: uid('event'), at: createdAt, text: 'Case created.' }],
    }
    if (!updateWorkspace((current) => ({ ...current, cases: [item, ...current.cases], activeCaseId: item.id }))) return
    event.currentTarget.reset()
    setNotice('Case created locally.')
  }

  const addEvidence = async (event) => {
    event.preventDefault()
    if (!activeCase) return
    const form = event.currentTarget
    const data = new FormData(form)
    const kind = String(data.get('kind') || 'note')
    const state = String(data.get('state') || 'OBSERVED')
    const value = String(data.get('value') || '').trim()
    const note = String(data.get('note') || '').trim()
    const file = fileRef.current?.files?.[0]
    if (!value && !file) {
      setNotice('Add a value or choose a file first.')
      return
    }

    let hashInput
    let fileMeta = {}
    if (file) {
      const bytes = await file.arrayBuffer()
      hashInput = bytes
      fileMeta = { fileName: file.name, fileSize: file.size, fileType: file.type }
    } else {
      hashInput = `${kind}\n${value}`
    }

    const recordedAt = nowIso()
    const evidence = {
      id: uid('ev'),
      kind: file ? 'file' : kind,
      state,
      value: file ? '' : value,
      note,
      recordedAt,
      sha256: await sha256(hashInput),
      ...fileMeta,
    }

    if (!patchCase(activeCase.id, (item) => ({
      ...item,
      evidence: [evidence, ...item.evidence],
      timeline: [{ id: uid('event'), at: recordedAt, text: `Evidence added: ${evidence.kind} (${evidence.state}).` }, ...item.timeline],
    }))) return
    form.reset()
    if (fileRef.current) fileRef.current.value = ''
    setNotice('Evidence receipt added. Intelligence index refreshed locally.')
  }

  const runScamCheck = () => setScanResult(analyzeMessage(scanText))

  const recordScan = async () => {
    if (!activeCase || !scanResult || !scanText.trim()) return
    const recordedAt = nowIso()
    const findingText = `ScamCheck ${scanResult.level} (${scanResult.score}/100): ${scanResult.findings.map((f) => f.label).join(', ') || 'No configured indicators matched.'}`
    const evidence = {
      id: uid('ev'),
      kind: 'message',
      state: 'INFERRED',
      value: scanText.trim(),
      note: findingText,
      recordedAt,
      sha256: await sha256(`message\n${scanText.trim()}`),
    }
    if (!patchCase(activeCase.id, (item) => ({
      ...item,
      evidence: [evidence, ...item.evidence],
      timeline: [{ id: uid('event'), at: recordedAt, text: 'ScamCheck analysis recorded as INFERRED.' }, ...item.timeline],
    }))) return
    setNotice('Analysis recorded as INFERRED, not proof.')
  }

  const addAnalystLink = (event) => {
    event.preventDefault()
    if (!activeCase) return
    const data = new FormData(event.currentTarget)
    const from = String(data.get('from') || '')
    const to = String(data.get('to') || '')
    const relation = String(data.get('relation') || '').trim().toUpperCase().replace(/\s+/g, '_')
    const state = String(data.get('state') || 'CORRELATED')
    const note = String(data.get('note') || '').trim()
    if (!from || !to || from === to || !relation) {
      setNotice('Choose two different entities and describe the relationship.')
      return
    }
    const at = nowIso()
    const link = { id: uid('link'), from, to, relation, state, note, createdAt: at }
    if (!patchCase(activeCase.id, (item) => ({
      ...item,
      analystLinks: [link, ...item.analystLinks],
      timeline: [{ id: uid('event'), at, text: `Analyst link added: ${relation} (${state}).` }, ...item.timeline],
    }))) return
    event.currentTarget.reset()
    setNotice('Analyst relationship added with explicit evidence state.')
  }

  const removeAnalystLink = (linkId) => {
    if (!activeCase) return
    if (!patchCase(activeCase.id, (item) => ({ ...item, analystLinks: item.analystLinks.filter((link) => link.id !== linkId) }))) return
    setNotice('Analyst link removed.')
  }

  const updateNotes = (value) => {
    if (!activeCase) return
    patchCase(activeCase.id, (item) => ({ ...item, notes: value }))
  }

  const exportCase = (format) => {
    if (!activeCase) return
    const base = activeCase.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'case'
    if (format === 'json') {
      const packet = {
        schema: 'scamalax.case.v2',
        exportedAt: nowIso(),
        appVersion: VERSION,
        case: activeCase,
        derivedIntelligence: {
          authority: 'NON_AUTHORITATIVE',
          entities,
          crossCaseMatches,
        },
      }
      download(`${base}-scamalax-v2.json`, JSON.stringify(packet, null, 2), 'application/json')
    } else {
      download(`${base}-scamalax-v2.md`, caseToMarkdown(activeCase, entities, crossCaseMatches), 'text/markdown')
    }
  }

  const exportWorkspace = () => {
    try {
      const { store: latest } = readWorkspace(localStorage)
      const packet = { schema: BACKUP_SCHEMA, exportedAt: nowIso(), appVersion: VERSION, store: latest }
      download('scamalax-workspace-backup.json', JSON.stringify(packet, null, 2), 'application/json')
    } catch (cause) { setPersistenceError(cause.message) }
  }

  const confirmRestore = (backup, selectedIds) => {
    const result = restoreWorkspace(localStorage, backup, selectedIds)
    storeRef.current = result.store
    savedRawRef.current = result.raw
    setStore(result.store)
    setPersistenceError('')
    loadErrorRef.current = ''
    return result
  }

  const setStatus = (status) => {
    if (!activeCase) return
    const at = nowIso()
    patchCase(activeCase.id, (item) => ({
      ...item,
      status,
      timeline: [{ id: uid('event'), at, text: `Case status changed to ${status}.` }, ...item.timeline],
    }))
  }

  const removeAllLocalData = () => {
    if (!window.confirm('Delete every local SCAM-A-LAX case from this browser? This cannot be undone.')) return
    try {
      localStorage.removeItem(WORKSPACE_KEY)
      const empty = { cases: [], activeCaseId: null }
      storeRef.current = empty
      savedRawRef.current = null
      loadErrorRef.current = ''
      setStore(empty)
      setPersistenceError('')
      setRestoreOpen(false)
      setNotice('Local case data deleted.')
    } catch { setPersistenceError('The browser could not delete the saved cases. Your data has been left untouched.') }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">SCAM INTELLIGENCE &amp; EVIDENCE WORKSTATION</div>
          <h2 className="workstation-title">SCAM-A-LAX</h2>
          <p className="tagline">Flush scams. Preserve evidence. Map the mess.</p>
        </div>
        <div className="version-card">
          <span>{VERSION}</span>
          <small>LOCAL-FIRST / DEFENSIVE</small>
        </div>
      </header>

      <div className="safety-strip">
        <strong>Bounded use:</strong> No unauthorized access, retaliation, doxxing, malware, or credential theft. Extracted entities and correlations are not guilt.
      </div>

      <main className="workspace">
        <aside className="sidebar panel">
          <div className="section-heading">
            <div><span className="kicker">CASE DESK</span><h2>Local cases</h2></div>
            <span className="count-pill">{store.cases.length}</span>
          </div>

          <form className="case-form" onSubmit={createCase}>
            <input name="title" placeholder="Case title" aria-label="Case title" required />
            <input name="victimAlias" placeholder="Victim alias (optional)" aria-label="Victim alias" />
            <input name="type" placeholder="Scam type (optional)" aria-label="Scam type" />
            <button className="primary" type="submit">+ New case</button>
          </form>

          <div className="case-list">
            {store.cases.length === 0 && <p className="muted empty">No cases yet. The internet has briefly behaved itself.</p>}
            {store.cases.map((item) => (
              <button
                key={item.id}
                className={`case-row ${item.id === store.activeCaseId ? 'active' : ''}`}
                onClick={() => updateWorkspace((current) => ({ ...current, activeCaseId: item.id }))}
              >
                <span>{item.title}</span>
                <small>{item.status} · {item.evidence?.length || 0} evidence{item.restore ? ' · restored copy' : ''}</small>
              </button>
            ))}
          </div>

          <div className="sidebar-actions">
            <button onClick={exportWorkspace} disabled={!store.cases.length}>Backup workspace</button>
            <button ref={restoreButtonRef} onClick={() => setRestoreOpen(true)} disabled={Boolean(loadErrorRef.current)}>Restore backup</button>
            <button className="danger-link" onClick={removeAllLocalData}>Delete all local data</button>
          </div>
        </aside>

        <section className="content">
          <nav className="tabs" aria-label="SCAM-A-LAX modules">
            {[
              ['ledger', 'Scam Ledger'],
              ['intelligence', 'Intelligence Graph'],
              ['check', 'ScamCheck'],
              ['rescue', 'Victim Rescue'],
              ['packet', 'Case Packet'],
            ].map(([id, label]) => (
              <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>
            ))}
          </nav>

          {persistenceError && <div className="workspace-save-error" role="alert">
            <p>{persistenceError}</p>
            {loadErrorRef.current && initial.raw !== null && <button onClick={() => download('scamalax-saved-data.json', initial.raw, 'application/json')}>Download saved data</button>}
          </div>}

          {restoreOpen && <RestoreBackup store={store} onRestore={confirmRestore} onCancel={() => { setRestoreOpen(false); restoreButtonRef.current?.focus() }} onBackup={exportWorkspace} />}

          {!activeCase && (
            <div className="hero-empty panel">
              <div className="toilet-mark">🚽</div>
              <span className="kicker">READY</span>
              <h2>Your story deserves a clear record.</h2>
              <p>Create a local case using the form to organize messages, notes, and file receipts.</p>
              <div className="terminal">
                <div>&gt; evidence boundary: ACTIVE</div>
                <div>&gt; derived intelligence authority: NONE</div>
                <div>&gt; cross-case correlation: CAUTIOUSLY NOSY</div>
                <div>&gt; common sense module: STILL BEST EFFORT</div>
              </div>
            </div>
          )}

          {activeCase && (
            <>
              <section className="case-header panel">
                <div>
                  <span className="kicker">ACTIVE CASE</span>
                  <h2>{activeCase.title}</h2>
                  <p>{activeCase.victimAlias || 'No victim alias'} · {activeCase.type || 'Type unknown'} · Created {new Date(activeCase.createdAt).toLocaleString()}</p>
                </div>
                <div className="case-head-meta">
                  <div className="intel-mini"><strong>{entities.length}</strong><span>entities</span></div>
                  <div className="intel-mini"><strong>{crossCaseMatches.length}</strong><span>cross-case</span></div>
                  <select value={activeCase.status} onChange={(e) => setStatus(e.target.value)} aria-label="Case status">
                    <option>OPEN</option><option>CONTAINED</option><option>REFERRED</option><option>CLOSED</option>
                  </select>
                </div>
              </section>

              {view === 'ledger' && (
                <div className="module-grid">
                  <section className="panel">
                    <div className="section-heading"><div><span className="kicker">SCAM LEDGER</span><h2>Add evidence receipt</h2></div></div>
                    <form className="evidence-form" onSubmit={addEvidence}>
                      <div className="two-col">
                        <label>Kind
                          <select name="kind" defaultValue="message">{evidenceKinds.map((kind) => <option key={kind}>{kind}</option>)}</select>
                        </label>
                        <label>Evidence state
                          <select name="state" defaultValue="OBSERVED">{evidenceStates.map((state) => <option key={state}>{state}</option>)}</select>
                        </label>
                      </div>
                      <label>Value / indicator
                        <textarea name="value" rows="4" placeholder="Message text, phone, URL, wallet, transaction ID, observation…" />
                      </label>
                      <label>Original file (optional)
                        <input ref={fileRef} name="file" type="file" />
                        <small>The browser hashes the file. SCAM-A-LAX does not upload or store its bytes.</small>
                      </label>
                      <label>Analyst note
                        <input name="note" placeholder="Why this matters, source context, caveat…" />
                      </label>
                      <button className="primary" type="submit">Hash + add receipt</button>
                    </form>
                  </section>

                  <section className="panel">
                    <div className="section-heading"><div><span className="kicker">MANIFEST</span><h2>{activeCase.evidence.length} evidence records</h2></div></div>
                    <div className="evidence-list">
                      {activeCase.evidence.length === 0 && <p className="muted empty">Nothing recorded yet.</p>}
                      {activeCase.evidence.map((ev) => (
                        <article className="evidence-card" key={ev.id}>
                          <div className="evidence-top">
                            <span className={`state state-${ev.state.toLowerCase()}`}>{ev.state}</span>
                            <span className="kind">{ev.kind}</span>
                            <time>{new Date(ev.recordedAt).toLocaleString()}</time>
                          </div>
                          {ev.fileName ? <strong>{ev.fileName}</strong> : <p>{ev.value}</p>}
                          {ev.note && <p className="note">{ev.note}</p>}
                          <code>sha256:{ev.sha256}</code>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {view === 'intelligence' && (
                <div className="intel-stack">
                  <section className="panel">
                    <div className="section-heading">
                      <div><span className="kicker">INTELLIGENCE GRAPH</span><h2>Evidence → entities → analyst links</h2></div>
                      <span className="authority-pill">DERIVED · NON-AUTHORITATIVE</span>
                    </div>
                    <p className="muted">Entity extraction is deterministic and local. The graph never upgrades the authority of its source evidence.</p>
                    <RelationshipGraph item={activeCase} entities={entities} />
                    <div className="graph-legend">
                      <span><i className="legend-case" /> Case</span>
                      <span><i className="legend-evidence" /> Evidence</span>
                      <span><i className="legend-entity" /> Extracted entity</span>
                      <span><i className="legend-analyst" /> Analyst-authored link</span>
                    </div>
                  </section>

                  <div className="module-grid intel-columns">
                    <section className="panel">
                      <div className="section-heading">
                        <div><span className="kicker">ENTITY INDEX</span><h2>{entities.length} extracted entities</h2></div>
                        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} aria-label="Filter entity type">
                          <option value="all">All types</option>
                          {entityTypesPresent.map((type) => <option value={type} key={type}>{entityLabel(type)}</option>)}
                        </select>
                      </div>
                      {!filteredEntities.length && <p className="muted empty">No extractable indicators yet. Add message text, URLs, emails, phones, IPs, wallets, or remote-access IDs to the ledger.</p>}
                      <div className="entity-list">
                        {filteredEntities.map((entity) => (
                          <article className="entity-card" key={entity.id}>
                            <div><span className="entity-type">{entityLabel(entity.type)}</span><code>{entity.value}</code></div>
                            <div className="entity-meta"><strong>{entity.sourceIds.length}</strong> source{entity.sourceIds.length === 1 ? '' : 's'} · {entity.occurrences} occurrence{entity.occurrences === 1 ? '' : 's'}</div>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="panel">
                      <span className="kicker">CROSS-CASE CORRELATION</span>
                      <h2>{crossCaseMatches.length} shared useful identifiers</h2>
                      <p className="muted">Generic providers are suppressed. A shared identifier is a lead to review, not proof that cases share an operator.</p>
                      {!crossCaseMatches.length && <p className="muted empty">No useful shared entities across local cases.</p>}
                      <div className="correlation-list">
                        {crossCaseMatches.map((match) => (
                          <article className="correlation-card" key={match.key}>
                            <span>{entityLabel(match.type)}</span>
                            <code>{match.value}</code>
                            <small>{match.cases.map((entry) => entry.title).join(' ↔ ')}</small>
                          </article>
                        ))}
                      </div>
                    </section>
                  </div>

                  <section className="panel">
                    <div className="section-heading"><div><span className="kicker">ANALYST LINKS</span><h2>Explicit relationship hypotheses</h2></div><span className="count-pill">{activeCase.analystLinks.length}</span></div>
                    <p className="muted">Manual relationships never become observations by magic. Pick an evidence state that describes the support you actually have.</p>
                    {entities.length >= 2 ? (
                      <form className="link-form" onSubmit={addAnalystLink}>
                        <label>From entity
                          <select name="from" required><option value="">Choose entity</option>{entities.map((entity) => <option value={entity.id} key={`from-${entity.id}`}>{entityLabel(entity.type)} · {short(entity.value, 38)}</option>)}</select>
                        </label>
                        <label>Relationship
                          <input name="relation" placeholder="e.g. PAYMENT_TO, CONTACTED_VIA" required />
                        </label>
                        <label>To entity
                          <select name="to" required><option value="">Choose entity</option>{entities.map((entity) => <option value={entity.id} key={`to-${entity.id}`}>{entityLabel(entity.type)} · {short(entity.value, 38)}</option>)}</select>
                        </label>
                        <label>State
                          <select name="state" defaultValue="CORRELATED">{evidenceStates.map((state) => <option key={state}>{state}</option>)}</select>
                        </label>
                        <label className="link-note">Note
                          <input name="note" placeholder="Source, caveat, or why the relationship is plausible…" />
                        </label>
                        <button className="primary" type="submit">Add analyst link</button>
                      </form>
                    ) : <p className="muted empty">At least two extracted entities are needed for an analyst link.</p>}

                    <div className="analyst-link-list">
                      {activeCase.analystLinks.map((link) => (
                        <article key={link.id} className="analyst-link-card">
                          <span className={`state state-${link.state.toLowerCase()}`}>{link.state}</span>
                          <code>{short(link.from.replace(/^[^:]+:/, ''), 24)}</code>
                          <strong>{link.relation}</strong>
                          <code>{short(link.to.replace(/^[^:]+:/, ''), 24)}</code>
                          {link.note && <small>{link.note}</small>}
                          <button onClick={() => removeAnalystLink(link.id)} aria-label="Remove analyst link">×</button>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {view === 'check' && (
                <section className="panel module-single">
                  <span className="kicker">SCAMCHECK</span>
                  <h2>Explainable local message triage</h2>
                  <p className="muted">Paste suspicious text. Rules run entirely in this browser and produce indicators, not a verdict.</p>
                  <textarea className="scanner" rows="10" aria-label="Case message to check" value={scanText} onChange={(e) => { setScanText(e.target.value); setScanResult(null) }} placeholder="Paste a suspicious message, email body, payment instruction, or call notes…" />
                  <div className="button-row">
                    <button className="primary" onClick={runScamCheck} disabled={!scanText.trim()}>Analyze locally</button>
                    {scanResult && <button onClick={recordScan}>Record as INFERRED</button>}
                  </div>
                  {scanResult && (
                    <div className={`risk-card risk-${scanResult.level.toLowerCase()}`}>
                      <div className="risk-score"><strong>{scanResult.score}</strong><span>/100</span></div>
                      <div>
                        <span className="kicker">{scanResult.level} INDICATOR LOAD</span>
                        <h3>{scanResult.findings.length ? `${scanResult.findings.length} configured indicators matched` : 'No configured indicators matched'}</h3>
                        <div className="chips">{scanResult.findings.map((finding) => <span key={finding.label}>{finding.label}</span>)}</div>
                        <p>This is a pattern-weight total, not a scam probability. Legitimate messages can match rules, and scams can avoid them. No matches leave safety unverified.</p>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {view === 'rescue' && (
                <section className="panel module-single rescue">
                  <span className="kicker">VICTIM RESCUE</span>
                  <h2>I think I’m being scammed right now.</h2>
                  <p className="rescue-lead">Prioritize stopping additional loss and regaining control. Do not confront or retaliate.</p>
                  <div className="rescue-list">
                    {rescueSteps.map((step, index) => (
                      <label key={step} className={rescueChecks[index] ? 'checked' : ''}>
                        <input type="checkbox" checked={Boolean(rescueChecks[index])} onChange={(e) => setRescueChecks((current) => ({ ...current, [index]: e.target.checked }))} />
                        <span><strong>{index + 1}</strong>{step}</span>
                      </label>
                    ))}
                  </div>
                  <div className="callout">If there is immediate danger to a person, use the emergency service appropriate for your location.</div>
                </section>
              )}

              {view === 'packet' && (
                <div className="module-grid packet-grid">
                  <section className="panel">
                    <span className="kicker">CASE PACKET v2</span>
                    <h2>Export evidence + derived intelligence</h2>
                    <p className="muted">Exports identify entity extraction and correlations as non-authoritative derived intelligence. Original file bytes are never included.</p>
                    <div className="packet-stats packet-stats-v2">
                      <div><strong>{activeCase.evidence.length}</strong><span>Evidence</span></div>
                      <div><strong>{entities.length}</strong><span>Entities</span></div>
                      <div><strong>{activeCase.analystLinks.length}</strong><span>Analyst links</span></div>
                      <div><strong>{crossCaseMatches.length}</strong><span>Cross-case</span></div>
                    </div>
                    <div className="button-row stack-mobile">
                      <button className="primary" onClick={() => exportCase('md')}>Download Markdown packet</button>
                      <button onClick={() => exportCase('json')}>Download JSON archive</button>
                    </div>
                  </section>
                  <section className="panel">
                    <span className="kicker">INVESTIGATOR NOTES</span>
                    <h2>Case context</h2>
                    <textarea rows="13" value={activeCase.notes} onChange={(e) => updateNotes(e.target.value)} placeholder="Context, actions taken, handoff notes, unresolved questions…" />
                    <small className="muted">Saved locally in this browser.</small>
                  </section>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer>
        <span>FREE · OPEN SOURCE · PEOPLE POWERED</span>
        <span>Same internet. Fewer victims. Better receipts.</span>
      </footer>

      {notice && <div className="toast">{notice}</div>}
    </div>
  )
}

export default AppV2
