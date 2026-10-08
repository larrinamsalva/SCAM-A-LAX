import { useEffect, useMemo, useRef, useState } from 'react'
import { entityLabel, extractEntitiesFromEvidence, getCrossCaseMatches } from './intelligence'
import { analyzeMessage } from './scamcheck.js'
import { VERSION } from './version.js'
import ScamRadar from './ScamRadar.jsx'
import Screenshot, { SelectedScreenshot } from './Screenshot.jsx'
import { clearScreenshots, exportScreenshots, isScreenshotFile, prepareScreenshot, removeScreenshot, saveScreenshot, screenshotError, SCREENSHOT_LIMIT } from './screenshots.js'
import { readWorkspace, writeWorkspace } from './workspace-storage.js'
import NewCaseForm from './NewCaseForm.jsx'
import { emptyCaseDraft, findSavedCases, saveStoryCorrection, STORY_LIMIT } from './case-workflow.js'
import ContactLog from './ContactLog.jsx'
import { emptyContactDraft, hasContactDraft } from './contact-records.js'
import { evidenceValueMarkdown } from './intake.js'

const STORAGE_KEY = 'scamalax.state.v1'
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

function safeLoad() {
  try {
    const parsed = readWorkspace()
    return { store: { ...parsed, cases: parsed.cases.map(normalizeCase) }, error: '' }
  } catch {
    return { store: { cases: [], activeCaseId: null }, error: 'Saved cases could not be read in this browser. Existing data has not been changed. Keep any backup you have.' }
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
    ...(item.incidentDate ? [`- **Incident date (user supplied):** ${item.incidentDate}`] : []),
    ...(item.reportedLoss ? [`- **Approximate loss (user supplied):** ${item.reportedLoss.amount} ${item.reportedLoss.currency}`] : []),
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
    lines.push(`- **${ev.contact ? 'Note saved at' : 'Recorded'}:** ${ev.recordedAt}`)
    if (ev.contact) lines.push(`- **Contact format:** ${ev.contact.schema}`)
    if (ev.relatedContactId) lines.push(`- **Attachment for contact record:** ${ev.relatedContactId}`)
    if (ev.sourceType === 'USER_STATEMENT') lines.push('- **Source:** User statement, not independently verified')
    if (ev.correctsRecordId) lines.push(`- **Clarifies record:** ${ev.correctsRecordId} (original retained)`)
    lines.push(`- **SHA-256:** \`${ev.sha256}\``)
    if (ev.fileName) lines.push(`- **File:** ${ev.fileName} (${ev.fileSize} bytes, ${ev.fileType || 'unknown type'})`)
    if (ev.value) lines.push(...evidenceValueMarkdown(ev, '- **Value:** '))
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

function AppV2({ caseDraft, onCaseDraftChange, onCaseBusyChange, caseLeaveCheck }) {
  const [initial] = useState(safeLoad)
  const [store, setStore] = useState(initial.store)
  const [storageError, setStorageError] = useState(initial.error)
  const [view, setView] = useState('ledger')
  const [notice, setNotice] = useState('')
  const [rescueChecks, setRescueChecks] = useState({})
  const [scanText, setScanText] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [entityFilter, setEntityFilter] = useState('all')
  const fileRef = useRef(null)
  const recordForm = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [keepScreenshot, setKeepScreenshot] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [exporting, setExporting] = useState(false)
  const savingRef = useRef(false)
  const caseHeading = useRef(null)
  const [savedCaseId, setSavedCaseId] = useState(null)
  const [caseQuery, setCaseQuery] = useState('')
  const [caseFilter, setCaseFilter] = useState('all')
  const [caseSort, setCaseSort] = useState('newest')
  const [correctionTarget, setCorrectionTarget] = useState(null)
  const [correctionText, setCorrectionText] = useState('')
  const [correctionError, setCorrectionError] = useState('')
  const [contactDraft, setContactDraft] = useState(emptyContactDraft)
  const draft = caseDraft || emptyCaseDraft(store.cases.length === 0)
  const visibleCases = useMemo(() => findSavedCases(store.cases, { query: caseQuery, status: caseFilter, sort: caseSort }), [store.cases, caseQuery, caseFilter, caseSort])

  const hasRecordDraft = () => {
    if (!recordForm.current) return false
    const values = new FormData(recordForm.current)
    return Boolean(String(values.get('value') || '').trim() || String(values.get('note') || '').trim() || fileRef.current?.files?.length)
  }
  const confirmCaseChange = () => !savingRef.current && (!(correctionText.trim() || hasRecordDraft() || hasContactDraft(contactDraft)) || window.confirm('Discard the unsaved record, contact note, or clarification before leaving this case? Your saved records will stay unchanged.'))
  const clearRecordDraft = () => {
    recordForm.current?.reset()
    if (fileRef.current) fileRef.current.value = ''
    setSelectedFile(null)
    setKeepScreenshot(true)
    setCorrectionTarget(null)
    setCorrectionText('')
    setCorrectionError('')
    setContactDraft(emptyContactDraft())
  }
  useEffect(() => {
    caseLeaveCheck.current = confirmCaseChange
    const warnBeforeLeaving = (event) => { if (correctionText.trim() || hasRecordDraft() || hasContactDraft(contactDraft) || savingRef.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => { caseLeaveCheck.current = null; window.removeEventListener('beforeunload', warnBeforeLeaving) }
  }, [correctionText, contactDraft, caseLeaveCheck])

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

  const commitStore = (updater) => {
    try {
      const next = writeWorkspace((current) => updater({ ...current, cases: current.cases.map(normalizeCase) }))
      setStore(next)
      setStorageError('')
      return true
    } catch {
      setStorageError('Changes could not be saved in this browser. Existing records have not been replaced. Keep any unsaved text or image and try again.')
      return false
    }
  }

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(''), 3400)
    return () => clearTimeout(timer)
  }, [notice])

  const patchCase = (caseId, updater) => {
    return commitStore((current) => {
      if (!current.cases.some((item) => item.id === caseId)) throw new Error('Case no longer exists')
      return { ...current, cases: current.cases.map((item) => item.id === caseId ? normalizeCase(updater(item)) : item) }
    })
  }

  const createCase = (event) => {
    event.preventDefault()
    if (!confirmCaseChange()) return
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
    if (!commitStore((current) => ({ ...current, cases: [item, ...current.cases], activeCaseId: item.id }))) return
    setView('ledger')
    clearRecordDraft()
    event.currentTarget.reset()
    setNotice('Your case was created successfully. Your story has not been added as an evidence record yet.')
  }

  const caseAndStorySaved = ({ store: next, item }) => {
    setStore({ ...next, cases: next.cases.map(normalizeCase) })
    setStorageError('')
    setSavedCaseId(item.id)
    setCaseQuery('')
    setCaseFilter('all')
    setView('ledger')
    clearRecordDraft()
    onCaseDraftChange(null)
    requestAnimationFrame(() => { caseHeading.current?.focus(); caseHeading.current?.scrollIntoView({ block: 'start' }) })
  }

  const saveCorrection = async (event) => {
    event.preventDefault()
    if (!activeCase || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setCorrectionError('')
    try {
      const next = await saveStoryCorrection(activeCase.id, correctionTarget, correctionText)
      setStore({ ...next, cases: next.cases.map(normalizeCase) })
      setCorrectionTarget(null)
      setCorrectionText('')
      setNotice('Clarification saved as a new statement. The original record was kept.')
    } catch { setCorrectionError('The clarification could not be saved. Your text and the original record are unchanged; keep this text and try again.') }
    finally { savingRef.current = false; setSaving(false) }
  }

  const addEvidence = async (event) => {
    event.preventDefault()
    if (!activeCase || savingRef.current) return
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

    if (file?.size > 25 * 1024 * 1024) { setSaveError('Choose a file smaller than 25 MB. Your record has not been saved.'); return }
    if (file && keepScreenshot && isScreenshotFile(file) && file.size > SCREENSHOT_LIMIT) { setSaveError('Choose a screenshot smaller than 10 MB. Your record has not been saved.'); return }
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    let image
    let imageSaved = false
    try {
      const hashInput = file ? await file.arrayBuffer() : `${kind}\n${value}`
      const hash = await sha256(hashInput)
      const fileMeta = file ? { fileName: file.name, fileSize: file.size, fileType: file.type } : {}
      if (file && keepScreenshot && isScreenshotFile(file)) {
        image = await prepareScreenshot(file, hashInput, hash)
        await saveScreenshot(image)
        imageSaved = true
        fileMeta.screenshot = { id: image.id, type: image.type, width: image.width, height: image.height }
        fileMeta.fileType = image.type
      }
      const recordedAt = nowIso()
      const evidence = { id: uid('ev'), kind: file ? 'file' : kind, state, value, note, recordedAt, sha256: hash, ...fileMeta }
      const saved = patchCase(activeCase.id, (item) => ({
        ...item,
        evidence: [evidence, ...item.evidence],
        timeline: [{ id: uid('event'), at: recordedAt, text: `Evidence added: ${evidence.kind} (${evidence.state}).` }, ...item.timeline],
      }))
      if (!saved) {
        if (imageSaved) await removeScreenshot(image.id)
        imageSaved = false
        setSaveError('The record could not be saved. Your text and selected file are still here; keep the original image and try again.')
        return
      }
      form.reset()
      if (fileRef.current) fileRef.current.value = ''
      setSelectedFile(null)
      setKeepScreenshot(true)
      setNotice(imageSaved ? 'Screenshot saved with this case. It will be included in JSON backups.' : 'Record added. It now appears in this case’s saved records.')
    } catch (error) {
      if (imageSaved) await removeScreenshot(image.id).catch(() => {})
      setSaveError(screenshotError(error))
    } finally { savingRef.current = false; setSaving(false) }
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

  const exportCase = async (format) => {
    if (!activeCase || exporting) return
    setExporting(true)
    try {
      const base = activeCase.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'case'
      if (format === 'json') {
        const packet = {
          schema: 'scamalax.case.v2',
          exportedAt: nowIso(),
          appVersion: VERSION,
          case: activeCase,
          derivedIntelligence: { authority: 'NON_AUTHORITATIVE', entities, crossCaseMatches },
        }
        const attachments = await exportScreenshots([activeCase])
        if (attachments.length) packet.attachments = attachments
        download(`${base}-scamalax-v2.json`, JSON.stringify(packet, null, 2), 'application/json')
      } else {
        download(`${base}-scamalax-v2.md`, caseToMarkdown(activeCase, entities, crossCaseMatches), 'text/markdown')
      }
    } catch { setNotice('Export could not include a saved screenshot. Your records are unchanged. Keep or download the original image separately.') }
    finally { setExporting(false) }
  }

  const exportWorkspace = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const current = readWorkspace()
      const packet = { schema: 'scamalax.workspace.v1', exportedAt: nowIso(), appVersion: VERSION, store: current }
      const attachments = await exportScreenshots(current.cases)
      if (attachments.length) packet.attachments = attachments
      download('scamalax-workspace-backup.json', JSON.stringify(packet, null, 2), 'application/json')
    } catch { setNotice('Backup could not be created. Your records are unchanged. Keep or download original images separately and try again.') }
    finally { setExporting(false) }
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

  const removeAllLocalData = async () => {
    if (saving || exporting) return
    if (!window.confirm('Delete every local SCAM-A-LAX case and saved screenshot from this browser? This cannot be undone.')) return
    try { localStorage.removeItem(STORAGE_KEY) } catch { setStorageError('Local data could not be deleted because browser storage is unavailable.'); return }
    setStore({ cases: [], activeCaseId: null })
    try { await clearScreenshots(); setNotice('Local case data and saved screenshots deleted.') }
    catch { setNotice('Cases were deleted, but screenshot storage could not be cleared. Try Delete all local data again to remove stored images.') }
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

          <button className="primary" type="button" disabled={saving} onClick={() => onCaseDraftChange({ ...draft, open: true })}>{draft.story || draft.file ? 'Continue case draft' : 'Save a new case'}</button>
          <details className="case-folder-form"><summary>Advanced: create an empty case folder</summary><p className="muted">This saves a folder only. Use Save a new case above to save your story with it.</p><form className="case-form" onSubmit={createCase}>
            <input name="title" placeholder="Case title" aria-label="Case title" required />
            <input name="victimAlias" placeholder="Victim alias (optional)" aria-label="Victim alias" />
            <input name="type" placeholder="Scam type (optional)" aria-label="Scam type" />
            <button className="primary" type="submit" disabled={saving}>+ New case</button>
          </form></details>

          <div className="case-search">
            <label htmlFor="case-search">Find a saved case</label><input id="case-search" type="search" value={caseQuery} onChange={(event) => setCaseQuery(event.target.value)} placeholder="Story words, case name, ID, or file name…" />
            <label htmlFor="case-filter">Filter case status</label><select id="case-filter" value={caseFilter} onChange={(event) => setCaseFilter(event.target.value)}><option value="all">All statuses</option>{['OPEN', 'CONTAINED', 'REFERRED', 'CLOSED'].map((status) => <option key={status}>{status}</option>)}</select>
            <label htmlFor="case-sort">Sort saved cases</label><select id="case-sort" value={caseSort} onChange={(event) => setCaseSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Case name A–Z</option></select>
            <p className="case-match-count" role="status">{visibleCases.length} of {store.cases.length} saved cases shown</p>
          </div>

          <div className="case-list">
            {store.cases.length === 0 && <p className="muted empty">No saved cases yet. Use Save a new case to keep your story.</p>}
            {store.cases.length > 0 && visibleCases.length === 0 && <div className="muted empty"><p>No cases match these filters. Your saved cases are unchanged.</p><button type="button" onClick={() => { setCaseQuery(''); setCaseFilter('all') }}>Clear case filters</button></div>}
            {visibleCases.map((item) => (
              <button
                key={item.id}
                className={`case-row ${item.id === store.activeCaseId ? 'active' : ''}`}
                onClick={() => { if (item.id !== store.activeCaseId && !confirmCaseChange()) return; if (commitStore((current) => ({ ...current, activeCaseId: item.id }))) { setScanText(''); setScanResult(null); setSaveError(''); if (item.id !== store.activeCaseId) clearRecordDraft() } }}
                disabled={saving}
              >
                <span>{item.title}</span>
                <small>{item.status} · {item.evidence?.length || 0} {item.evidence?.length === 1 ? 'record' : 'records'}</small>
              </button>
            ))}
          </div>

          <div className="sidebar-actions">
            <button onClick={exportWorkspace} disabled={!store.cases.length || exporting || saving}>{exporting ? 'Preparing download…' : 'Backup workspace'}</button>
            <button className="danger-link" onClick={removeAllLocalData} disabled={saving || exporting}>Delete all local data</button>
          </div>
        </aside>

        <section className="content">
          {storageError && <p className="record-save-error" role="alert">{storageError}</p>}
          <NewCaseForm draft={draft} onChange={onCaseDraftChange} onSaved={caseAndStorySaved} onBeforeSave={confirmCaseChange} onDiscard={() => onCaseDraftChange(emptyCaseDraft(false))} onBusyChange={(busy) => { savingRef.current = busy; setSaving(busy); onCaseBusyChange(busy) }} />
          {activeCase && savedCaseId === activeCase.id && <div className="case-saved-confirmation" role="status"><strong>Case and story saved in this browser.</strong><p>{activeCase.evidence.length} saved record(s). Your story is in Scam Ledger below. Select Backup workspace to keep a copy.</p></div>}
          <nav className="tabs" aria-label="SCAM-A-LAX modules">
            {[
              ['ledger', 'Scam Ledger'],
              ['contacts', 'Call & message log'],
              ['intelligence', 'Intelligence Graph'],
              ['check', 'ScamCheck'],
              ['rescue', 'Victim Rescue'],
              ['packet', 'Case Packet'],
            ].map(([id, label]) => (
              <button key={id} disabled={saving} className={view === id ? 'active' : ''} onClick={() => { if (id !== view && !confirmCaseChange()) return; if (id !== view) clearRecordDraft(); setView(id) }}>{label}</button>
            ))}
          </nav>

          {!activeCase && !draft.open && (
            <div className="hero-empty panel">
              <div className="toilet-mark">🚽</div>
              <span className="kicker">READY</span>
              <h2>Your story deserves a clear record.</h2>
              <p>Select Save a new case to describe what happened and keep your first record with it.</p>
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
                  <h2 ref={caseHeading} tabIndex={-1}>{activeCase.title}</h2>
                  <p>{activeCase.victimAlias || 'No victim alias'} · {activeCase.type || 'Type unknown'} · Created {new Date(activeCase.createdAt).toLocaleString()}</p>
                  <p className="case-id">Case ID: {activeCase.id}</p>
                  {(activeCase.incidentDate || activeCase.reportedLoss) && <p className="muted">User supplied: {activeCase.incidentDate ? `Incident date ${activeCase.incidentDate}` : 'Incident date not provided'}{activeCase.reportedLoss ? ` · Approximate loss ${activeCase.reportedLoss.amount} ${activeCase.reportedLoss.currency}` : ''}</p>}
                </div>
                <div className="case-head-meta">
                  <div className="intel-mini"><strong>{entities.length}</strong><span>entities</span></div>
                  <div className="intel-mini"><strong>{crossCaseMatches.length}</strong><span>cross-case</span></div>
                  <select value={activeCase.status} disabled={saving} onChange={(e) => setStatus(e.target.value)} aria-label="Case status">
                    <option>OPEN</option><option>CONTAINED</option><option>REFERRED</option><option>CLOSED</option>
                  </select>
                </div>
              </section>

              {view === 'ledger' && (
                <div className="module-grid">
                  <section className="panel">
                    <div className="section-heading"><div><span className="kicker">SCAM LEDGER</span><h2>Add a record</h2></div></div>
                    {activeCase.evidence.length === 0 && <p className="callout"><strong>Your case is ready. Add your first record.</strong><br />Your case was created successfully. Your story has not been added as an evidence record yet. Choose note, enter it below, then select Save record.</p>}
                    <form ref={recordForm} className="evidence-form" onSubmit={addEvidence}>
                      <div className="two-col">
                        <div className="record-field"><label htmlFor="record-kind">Kind</label><select id="record-kind" name="kind" defaultValue="message" disabled={saving} aria-describedby="record-kind-help">{evidenceKinds.map((kind) => <option key={kind}>{kind}</option>)}</select><small id="record-kind-help" className="muted">Choose note for your story, or message for text you received.</small></div>
                        <label>Evidence state
                          <select name="state" defaultValue="OBSERVED" disabled={saving}>{evidenceStates.map((state) => <option key={state}>{state}</option>)}</select>
                        </label>
                      </div>
                      <div className="record-field"><label htmlFor="record-value">Message or what happened</label><textarea id="record-value" name="value" rows="4" placeholder="Paste a message or describe what happened…" disabled={saving} aria-describedby="record-value-help" /><small id="record-value-help" className="muted">This text becomes a record only when you select Save record.</small></div>
                      <div className="record-field"><label htmlFor="record-file">Screenshot or original file (optional)</label><input id="record-file" ref={fileRef} name="file" type="file" disabled={saving} aria-describedby="record-file-help" onChange={(event) => { setSelectedFile(event.target.files?.[0] || null); setKeepScreenshot(true); setSaveError('') }} /><small id="record-file-help">PNG, JPG, and WebP screenshots up to 10 MB can be saved and viewed here. Other files keep a receipt only. Nothing is uploaded.</small></div>
                      {isScreenshotFile(selectedFile) && <><SelectedScreenshot file={selectedFile} /><label className="screenshot-choice"><input type="checkbox" checked={keepScreenshot} disabled={saving} aria-label="Save a viewable copy with this case" aria-describedby="record-image-copy-help" onChange={(event) => setKeepScreenshot(event.target.checked)} /><span>Save a viewable copy with this case<small id="record-image-copy-help">Included in JSON backups. Uncheck to keep only the file receipt.</small></span></label><small className="muted">To check the screenshot’s message, type or paste its words above. Image text is not read automatically.</small></>}
                      <label>Analyst note
                        <input name="note" disabled={saving} placeholder="Why this matters, source context, caveat…" />
                      </label>
                      {saveError && <p className="record-save-error" role="alert">{saveError}</p>}
                      <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving record…' : 'Save record'}</button>
                    </form>
                  </section>

                  <section className="panel">
                    <div className="section-heading"><div><span className="kicker">SAVED RECORDS</span><h2 aria-live="polite">{activeCase.evidence.length} saved {activeCase.evidence.length === 1 ? 'record' : 'records'}</h2></div></div>
                    <div className="evidence-list">
                      {activeCase.evidence.length === 0 && <p className="muted empty">No records added yet. Your case title is saved; use the record form to add your story.</p>}
                      {activeCase.evidence.map((ev) => (
                        <article className="evidence-card" key={ev.id}>
                          <div className="evidence-top">
                            <span className={`state state-${ev.state.toLowerCase()}`}>{ev.state}</span>
                            <span className="kind">{ev.kind}</span>
                            <time>{new Date(ev.recordedAt).toLocaleString()}</time>
                          </div>
                          {ev.fileName && <strong>{ev.fileName}</strong>}
                          {ev.sourceType === 'USER_STATEMENT' && <p className="case-source-label">User statement · not independently verified</p>}
                          {ev.correctsRecordId && <p className="case-source-label">Clarifies record {ev.correctsRecordId}. Original retained.</p>}
                          {ev.value && <p className={ev.contact ? 'contact-record-text' : undefined}>{ev.value}</p>}
                          {ev.screenshot?.id && <Screenshot record={ev} />}
                          {ev.note && <p className="note">{ev.note}</p>}
                          <code>sha256:{ev.sha256}</code>
                          {ev.value && <button type="button" disabled={saving} onClick={() => { if (!confirmCaseChange()) return; clearRecordDraft(); setScanText(ev.value); setScanResult(analyzeMessage(ev.value)); setView('check') }}>Check record text</button>}
                          {ev.sourceType === 'USER_STATEMENT' && <button type="button" disabled={saving} onClick={() => { if (correctionText && !window.confirm('Discard the unsaved clarification before starting another?')) return; setCorrectionTarget(ev.id); setCorrectionText(''); setCorrectionError('') }}>Add a clarification</button>}
                        </article>
                      ))}
                    </div>
                    {correctionTarget && <form className="case-correction" onSubmit={saveCorrection}><p>Add a correction or clarification as a new statement. The original record and its hash stay unchanged.</p><label htmlFor="case-correction">Correction or clarification</label><textarea id="case-correction" value={correctionText} onChange={(event) => setCorrectionText(event.target.value)} maxLength={STORY_LIMIT} rows={4} required disabled={saving} /><small>Source record: {correctionTarget}</small>{correctionError && <p role="alert" className="record-save-error">{correctionError}</p>}<div className="button-row"><button className="primary" disabled={saving || !correctionText.trim()}>{saving ? 'Saving clarification…' : 'Save clarification'}</button><button type="button" disabled={saving} onClick={() => { if (correctionText && !window.confirm('Discard this unsaved clarification? The original record will stay unchanged.')) return; setCorrectionTarget(null); setCorrectionText('') }}>Cancel clarification</button></div></form>}
                  </section>
                </div>
              )}

              {view === 'contacts' && <ContactLog key={activeCase.id} item={activeCase} draft={contactDraft} onChange={(next) => setContactDraft(next || emptyContactDraft())} saving={saving}
                onBusyChange={(busy) => { savingRef.current = busy; setSaving(busy); onCaseBusyChange(busy) }}
                onSaved={({ store: next }) => { setStore({ ...next, cases: next.cases.map(normalizeCase) }); setStorageError(''); setContactDraft(emptyContactDraft()) }}
                onOpenPacket={() => { if (!confirmCaseChange()) return; clearRecordDraft(); setView('packet') }} />}

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
                  <textarea className="scanner" rows="10" maxLength={20000} aria-label="Case message to check" value={scanText} onChange={(e) => { setScanText(e.target.value); setScanResult(null) }} placeholder="Paste a suspicious message, email body, payment instruction, or call notes…" />
                  <div className="button-row">
                    <button className="primary" onClick={runScamCheck} disabled={!scanText.trim()}>Analyze locally</button>
                    {scanResult && <button onClick={recordScan}>Record as INFERRED</button>}
                  </div>
                  {scanResult && (
                    <><ScamRadar result={scanResult} /><div className="case-radar-findings">{scanResult.findings.map((finding) => <article key={finding.id}><h3>{finding.label}</h3><p>Matched words: <q>{finding.excerpt}</q></p><p>{finding.why}</p><p><strong>Next step:</strong> {finding.action}</p></article>)}</div></>
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
                    <p className="muted">JSON archives include saved screenshots. Markdown reports contain file details and receipts; download original images separately when sharing a text report. Derived intelligence remains non-authoritative.</p>
                    <div className="packet-stats packet-stats-v2">
                      <div><strong>{activeCase.evidence.length}</strong><span>Evidence</span></div>
                      <div><strong>{entities.length}</strong><span>Entities</span></div>
                      <div><strong>{activeCase.analystLinks.length}</strong><span>Analyst links</span></div>
                      <div><strong>{crossCaseMatches.length}</strong><span>Cross-case</span></div>
                    </div>
                    <div className="button-row stack-mobile">
                      <button className="primary" disabled={exporting} onClick={() => exportCase('md')}>Download Markdown packet</button>
                      <button disabled={exporting} onClick={() => exportCase('json')}>Download JSON archive</button>
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

      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}

export default AppV2
