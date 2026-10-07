import { useMemo, useRef, useState } from 'react'
import AppV2 from './AppV2.jsx'
import { extractEntitiesFromEvidence, getCrossCaseMatches } from './intelligence.js'
import { buildHandoffPacket, buildIntakePreview, HANDOFF_PROFILES, handoffToMarkdown } from './intake.js'
import { VERSION } from './version.js'

const STORAGE_KEY = 'scamalax.state.v1'
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_FILES = 30
const evidenceStates = ['OBSERVED', 'SUPPORTED', 'CORRELATED', 'INFERRED', 'DISPUTED', 'UNKNOWN']
const evidenceKinds = ['message', 'email', 'phone', 'url', 'domain', 'wallet', 'payment', 'remote-access', 'file', 'note', 'other']

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function nowIso() {
  return new Date().toISOString()
}

function safeStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (parsed && Array.isArray(parsed.cases)) return parsed
  } catch {
    // A corrupt local store should not take down intake.
  }
  return { cases: [], activeCaseId: null }
}

async function sha256(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function download(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function safeName(value = 'case') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'case'
}

function EvidenceIntake({ onBack }) {
  const [store, setStore] = useState(safeStore)
  const [caseId, setCaseId] = useState(() => safeStore().activeCaseId || safeStore().cases?.[0]?.id || '')
  const [mode, setMode] = useState('auto')
  const [sourceLabel, setSourceLabel] = useState('')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState({ mode: 'bulk', records: [], warnings: [] })
  const [files, setFiles] = useState([])
  const [notice, setNotice] = useState('')
  const [profile, setProfile] = useState('victim')
  const fileInput = useRef(null)

  const activeCase = useMemo(() => store.cases.find((item) => item.id === caseId) || null, [store, caseId])

  const previewEvidence = useMemo(() => preview.records
    .filter((record) => record.selected)
    .map((record) => ({
      id: record.previewId,
      kind: record.kind,
      state: record.state,
      value: record.value,
      note: record.note,
      recordedAt: 'PREVIEW',
      sha256: 'PREVIEW',
    })), [preview.records])

  const previewEntities = useMemo(() => extractEntitiesFromEvidence(previewEvidence), [previewEvidence])

  const activeEntities = useMemo(
    () => extractEntitiesFromEvidence(activeCase?.evidence || []),
    [activeCase?.evidence],
  )

  const crossCaseMatches = useMemo(
    () => activeCase ? getCrossCaseMatches(store.cases, activeCase.id) : [],
    [store.cases, activeCase],
  )

  const handoffPacket = useMemo(() => {
    if (!activeCase) return null
    return buildHandoffPacket({
      item: activeCase,
      profile,
      entities: activeEntities,
      crossCaseMatches,
      appVersion: VERSION,
    })
  }, [activeCase, profile, activeEntities, crossCaseMatches])

  const refreshStore = () => {
    const current = safeStore()
    setStore(current)
    if (!current.cases.some((item) => item.id === caseId)) {
      setCaseId(current.activeCaseId || current.cases?.[0]?.id || '')
    }
  }

  const runPreview = () => {
    const next = buildIntakePreview({ text, mode, sourceLabel })
    setPreview(next)
    setNotice(next.records.length ? `Preview ready: ${next.records.length} proposed record${next.records.length === 1 ? '' : 's'}.` : 'Nothing to preview yet.')
  }

  const updateRecord = (previewId, patch) => {
    setPreview((current) => ({
      ...current,
      records: current.records.map((record) => record.previewId === previewId ? { ...record, ...patch } : record),
    }))
  }

  const toggleAll = (selected) => {
    setPreview((current) => ({
      ...current,
      records: current.records.map((record) => ({ ...record, selected })),
    }))
  }

  const handleFiles = (event) => {
    const chosen = [...(event.target.files || [])].slice(0, MAX_FILES)
    const accepted = []
    const rejected = []

    chosen.forEach((file, index) => {
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name} exceeds 25 MB`)
        return
      }
      accepted.push({
        intakeId: uid(`file-${index}`),
        file,
        selected: true,
        state: 'OBSERVED',
        note: sourceLabel ? `Source: ${sourceLabel}` : '',
      })
    })

    setFiles(accepted)
    if (rejected.length) setNotice(`Skipped ${rejected.length} oversized file${rejected.length === 1 ? '' : 's'}.`)
    else setNotice(`${accepted.length} file${accepted.length === 1 ? '' : 's'} staged for hashing.`)
  }

  const updateFile = (intakeId, patch) => {
    setFiles((current) => current.map((entry) => entry.intakeId === intakeId ? { ...entry, ...patch } : entry))
  }

  const commitBatch = async () => {
    if (!activeCase) {
      setNotice('Choose a case before committing intake.')
      return
    }

    const selectedRecords = preview.records.filter((record) => record.selected && record.value.trim())
    const selectedFiles = files.filter((entry) => entry.selected)
    if (!selectedRecords.length && !selectedFiles.length) {
      setNotice('Nothing is selected for commit.')
      return
    }

    const recordedAt = nowIso()
    const textEvidence = await Promise.all(selectedRecords.map(async (record) => ({
      id: uid('ev'),
      kind: record.kind,
      state: record.state,
      value: record.value.trim(),
      note: record.note.trim(),
      recordedAt,
      sha256: await sha256(`${record.kind}\n${record.value.trim()}`),
      intake: { mode: preview.mode, sourceLabel: sourceLabel.trim(), batch: true },
    })))

    const fileEvidence = []
    for (const entry of selectedFiles) {
      const bytes = await entry.file.arrayBuffer()
      fileEvidence.push({
        id: uid('ev'),
        kind: 'file',
        state: entry.state,
        value: '',
        note: entry.note.trim(),
        recordedAt,
        sha256: await sha256(bytes),
        fileName: entry.file.name,
        fileSize: entry.file.size,
        fileType: entry.file.type || 'application/octet-stream',
        intake: { mode: 'file', sourceLabel: sourceLabel.trim(), batch: true },
      })
    }

    const added = [...textEvidence, ...fileEvidence]
    const nextStore = {
      ...store,
      activeCaseId: activeCase.id,
      cases: store.cases.map((item) => item.id === activeCase.id ? {
        ...item,
        evidence: [...added, ...(item.evidence || [])],
        timeline: [
          {
            id: uid('event'),
            at: recordedAt,
            text: `Evidence Intake committed ${added.length} record${added.length === 1 ? '' : 's'} (${textEvidence.length} text, ${fileEvidence.length} file).`,
          },
          ...(item.timeline || []),
        ],
      } : item),
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStore))
    setStore(nextStore)
    setPreview({ mode: 'bulk', records: [], warnings: [] })
    setText('')
    setFiles([])
    if (fileInput.current) fileInput.current.value = ''
    setNotice(`${added.length} evidence record${added.length === 1 ? '' : 's'} committed. Original file bytes were not stored.`)
  }

  const exportHandoff = (format) => {
    if (!handoffPacket || !activeCase) return
    const base = `${safeName(activeCase.title)}-${profile}-handoff`
    if (format === 'json') {
      download(`${base}.json`, JSON.stringify(handoffPacket, null, 2), 'application/json')
    } else {
      download(`${base}.md`, handoffToMarkdown(handoffPacket), 'text/markdown')
    }
  }

  return (
    <div className="intake-shell">
      <header className="intake-topbar">
        <div>
          <span className="kicker">SCAM-A-LAX {VERSION}</span>
          <h2 className="intake-title">Evidence Intake</h2>
          <p>Preview first. Hash second. Commit only what you mean to preserve.</p>
        </div>
        <div className="intake-actions">
          <button onClick={refreshStore}>Refresh cases</button>
          <button className="primary" onClick={onBack}>Return to workstation</button>
        </div>
      </header>

      <div className="intake-boundary">
        <strong>Local-first:</strong> pasted text and selected files are processed in this browser. File bytes are hashed for receipts and are not stored in SCAM-A-LAX.
      </div>

      <main className="intake-layout">
        <section className="panel intake-source">
          <div className="section-heading">
            <div><span className="kicker">1 · SOURCE</span><h2>Stage incoming evidence</h2></div>
            <select value={caseId} onChange={(event) => setCaseId(event.target.value)} aria-label="Target case">
              <option value="">Choose case</option>
              {store.cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </div>

          {!store.cases.length && <div className="intake-warning">Create a case in the workstation before committing evidence.</div>}

          <div className="intake-grid-two">
            <label>Intake mode
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="auto">Auto detect</option>
                <option value="email">Raw email + headers</option>
                <option value="transcript">Call/chat transcript</option>
                <option value="bulk">Bulk text / indicators</option>
              </select>
            </label>
            <label>Source label
              <input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="e.g. victim phone, Gmail export, call notes" />
            </label>
          </div>

          <label>Paste source text
            <textarea rows="13" value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste a raw email, transcript, messages, URLs, phone numbers, payment instructions, or notes…" />
          </label>

          <div className="button-row">
            <button className="primary" onClick={runPreview} disabled={!text.trim()}>Build preview</button>
            <button onClick={() => { setText(''); setPreview({ mode: 'bulk', records: [], warnings: [] }) }}>Clear text</button>
          </div>

          <div className="file-stage">
            <div>
              <strong>Files / screenshots</strong>
              <p>Up to {MAX_FILES} files, 25 MB each. Images are hashed as evidence; image text is not read or interpreted.</p>
            </div>
            <input ref={fileInput} type="file" multiple onChange={handleFiles} />
          </div>

          {files.length > 0 && (
            <div className="staged-files">
              {files.map((entry) => (
                <article key={entry.intakeId} className="staged-file">
                  <input type="checkbox" checked={entry.selected} onChange={(event) => updateFile(entry.intakeId, { selected: event.target.checked })} />
                  <div><strong>{entry.file.name}</strong><small>{entry.file.type || 'unknown type'} · {Math.ceil(entry.file.size / 1024)} KB</small></div>
                  <select value={entry.state} onChange={(event) => updateFile(entry.intakeId, { state: event.target.value })}>
                    {evidenceStates.map((state) => <option key={state}>{state}</option>)}
                  </select>
                  <input value={entry.note} onChange={(event) => updateFile(entry.intakeId, { note: event.target.value })} placeholder="File context / note" />
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel intake-preview-panel">
          <div className="section-heading">
            <div><span className="kicker">2 · PREVIEW</span><h2>{preview.records.length} proposed records</h2></div>
            <span className="authority-pill">NOT COMMITTED</span>
          </div>

          {preview.warnings?.map((warning) => <div className="intake-warning" key={warning}>{warning}</div>)}

          {!!preview.records.length && (
            <div className="preview-toolbar">
              <span>Detected mode: <strong>{preview.mode}</strong></span>
              <button onClick={() => toggleAll(true)}>Select all</button>
              <button onClick={() => toggleAll(false)}>Select none</button>
            </div>
          )}

          {!preview.records.length && <p className="muted empty">Build a preview before anything can enter the ledger. Revolutionary stuff: software asking before it writes data.</p>}

          <div className="preview-records">
            {preview.records.map((record) => (
              <article className={`preview-record ${record.selected ? 'selected' : ''}`} key={record.previewId}>
                <input type="checkbox" checked={record.selected} onChange={(event) => updateRecord(record.previewId, { selected: event.target.checked })} />
                <div className="preview-body">
                  <div className="preview-controls">
                    <select value={record.kind} onChange={(event) => updateRecord(record.previewId, { kind: event.target.value })}>
                      {evidenceKinds.map((kind) => <option key={kind}>{kind}</option>)}
                    </select>
                    <select value={record.state} onChange={(event) => updateRecord(record.previewId, { state: event.target.value })}>
                      {evidenceStates.map((state) => <option key={state}>{state}</option>)}
                    </select>
                  </div>
                  <pre>{record.value}</pre>
                  <input value={record.note} onChange={(event) => updateRecord(record.previewId, { note: event.target.value })} placeholder="Source/context note" />
                </div>
              </article>
            ))}
          </div>

          {!!preview.records.length && (
            <div className="preview-intel">
              <span><strong>{previewEvidence.length}</strong> selected records</span>
              <span><strong>{previewEntities.length}</strong> extractable entities</span>
              <span><strong>{new Set(previewEntities.map((entity) => entity.type)).size}</strong> entity types</span>
            </div>
          )}

          <button className="primary commit-batch" onClick={commitBatch} disabled={!activeCase || (!previewEvidence.length && !files.some((entry) => entry.selected))}>
            Hash + commit selected evidence
          </button>
        </section>

        <section className="panel handoff-panel">
          <div className="section-heading">
            <div><span className="kicker">3 · HANDOFF</span><h2>Purpose-built case packet</h2></div>
            <span className="authority-pill">DERIVED INTEL LABELED</span>
          </div>
          <p className="muted">Choose the audience before export. Profiles filter presentation; they do not rewrite or upgrade the underlying evidence.</p>

          <div className="profile-grid">
            {HANDOFF_PROFILES.map((item) => (
              <button key={item.id} className={profile === item.id ? 'active' : ''} onClick={() => setProfile(item.id)}>
                <strong>{item.title}</strong>
                <small>{item.id === 'law' ? 'Full investigative context' : item.id === 'bank' ? 'Payment-focused review' : item.id === 'platform' ? 'Abuse indicators + source refs' : 'Readable victim evidence copy'}</small>
              </button>
            ))}
          </div>

          {handoffPacket ? (
            <>
              <div className="handoff-summary">
                <div><strong>{handoffPacket.evidence.length}</strong><span>Evidence records</span></div>
                <div><strong>{handoffPacket.derivedIntelligence.entities.length}</strong><span>Entities</span></div>
                <div><strong>{handoffPacket.timeline.length}</strong><span>Timeline events</span></div>
                <div><strong>{handoffPacket.derivedIntelligence.analystLinks.length}</strong><span>Analyst links</span></div>
              </div>
              <div className="handoff-caveat">{handoffPacket.caveat}</div>
              <div className="button-row">
                <button className="primary" onClick={() => exportHandoff('md')}>Download Markdown handoff</button>
                <button onClick={() => exportHandoff('json')}>Download JSON handoff</button>
              </div>
            </>
          ) : <p className="muted empty">Choose a case to build a handoff preview.</p>}
        </section>
      </main>

      {notice && <div className="toast">{notice}</div>}
    </div>
  )
}

export default function AppV3() {
  const [surface, setSurface] = useState('workstation')
  const [workstationKey, setWorkstationKey] = useState(0)

  const openIntake = () => setSurface('intake')
  const returnToWorkstation = () => {
    setWorkstationKey((value) => value + 1)
    setSurface('workstation')
  }

  if (surface === 'intake') return <EvidenceIntake onBack={returnToWorkstation} />

  return (
    <div className="app-v3-shell">
      <div className="v3-launchbar">
        <div><strong>SCAM-A-LAX {VERSION}</strong><span>Import evidence and prepare a handoff.</span></div>
        <button className="primary" onClick={openIntake}>Open Evidence Intake</button>
      </div>
      <AppV2 key={workstationKey} />
    </div>
  )
}
