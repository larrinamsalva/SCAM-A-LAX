import { useEffect, useMemo, useRef, useState } from 'react'
import { MAX_BACKUP_BYTES, parseWorkspaceBackup, previewWorkspaceRestore } from './workspace.js'
import './restore.css'

export default function RestoreBackup({ store, onRestore, onCancel, onBackup }) {
  const [backup, setBackup] = useState(null)
  const [filename, setFilename] = useState('')
  const [selected, setSelected] = useState([])
  const [error, setError] = useState('')
  const [completion, setCompletion] = useState('')
  const [reading, setReading] = useState(false)
  const requestRef = useRef(0)
  const headingRef = useRef(null)

  useEffect(() => {
    headingRef.current?.focus()
    return () => { requestRef.current++ }
  }, [])

  const rows = useMemo(() => backup ? previewWorkspaceRestore(store, backup) : [], [backup, store])
  const available = rows.filter((row) => row.status !== 'duplicate')
  const chosen = available.filter((row) => selected.includes(row.id))

  const chooseFile = async (event) => {
    const file = event.target.files?.[0]
    const request = ++requestRef.current
    setBackup(null)
    setSelected([])
    setError('')
    setCompletion('')
    setFilename(file?.name || '')
    if (!file) { setReading(false); return }
    setReading(true)
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Choose a JSON workspace backup no larger than 10 MB.')
      const parsed = parseWorkspaceBackup(await file.text())
      const preview = previewWorkspaceRestore(store, parsed)
      if (request !== requestRef.current) return
      setBackup(parsed)
      setSelected(preview.filter((row) => row.status !== 'duplicate').map((row) => row.id))
    } catch (cause) {
      if (request === requestRef.current) setError(cause.message || 'This file could not be read. Nothing was restored.')
    } finally {
      if (request === requestRef.current) setReading(false)
    }
  }

  const confirmRestore = () => {
    setError('')
    try {
      const result = onRestore(backup, chosen.map((row) => row.id))
      const skipped = rows.length - available.length + result.skipped
      setBackup(null)
      setSelected([])
      setCompletion(`${result.added} case${result.added === 1 ? '' : 's'} restored. ${result.copies} restored as separate copies. ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped.`)
    } catch (cause) {
      setError(cause.message || 'The restore could not be saved. Your existing cases have not changed.')
    }
  }

  return (
    <section className="restore-panel panel" aria-labelledby="restore-heading">
      <div className="section-heading">
        <div><span className="kicker">WORKSPACE BACKUP</span><h2 id="restore-heading" ref={headingRef} tabIndex={-1}>Restore saved cases</h2></div>
        <button onClick={onCancel}>{completion ? 'Close restore' : 'Cancel restore'}</button>
      </div>
      <p>Choose a SCAM-A-LAX workspace backup, review the cases, then confirm your selection. Existing cases stay in place. Exact duplicates are skipped; a different version of an existing case becomes a separate copy.</p>
      <p className="muted">Backups contain private case text in plain JSON. Keep them somewhere secure. File hash receipts are preserved; keep original attachments separately.</p>
      {store.cases.length > 0 && <button onClick={onBackup}>Download current backup</button>}
      <label className="restore-file">Choose workspace backup
        <input type="file" accept=".json,application/json" onChange={chooseFile} />
        <small>JSON workspace backup · up to 10 MB. Case packets cannot be restored here.</small>
      </label>
      {reading && <p role="status">Reading backup…</p>}
      {error && <p className="restore-error" role="alert">{error}</p>}
      {completion && <p className="restore-complete" role="status">{completion}</p>}
      {backup && (
        <div className="restore-preview">
          <h3>Backup preview</h3>
          <p className="restore-summary">{filename} · Exported {new Date(backup.exportedAt).toLocaleString()} · {backup.store.cases.length} case{backup.store.cases.length === 1 ? '' : 's'}</p>
          {!rows.length && <p>This backup has no cases to restore.</p>}
          {rows.length > 0 && <div className="restore-selection">
            <button onClick={() => setSelected(available.map((row) => row.id))} disabled={!available.length}>Select all available</button>
            <button onClick={() => setSelected([])} disabled={!chosen.length}>Clear selection</button>
            <span>{chosen.length} selected · {rows.length - available.length} duplicates skipped</span>
          </div>}
          <ul className="restore-cases">
            {rows.map((row) => (
              <li key={row.id}>
                <label>
                  <input type="checkbox" aria-label={`Restore ${row.title}`} checked={row.status !== 'duplicate' && selected.includes(row.id)} disabled={row.status === 'duplicate'} onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} />
                  <span><strong>{row.title}</strong><small>{row.evidenceCount} evidence record{row.evidenceCount === 1 ? '' : 's'} · {row.status === 'duplicate' ? 'Already saved — skipped' : row.status === 'copy' ? 'Different version — restore as a separate copy' : 'New case'}</small></span>
                </label>
              </li>
            ))}
          </ul>
          <button className="primary" onClick={confirmRestore} disabled={!chosen.length}>Restore {chosen.length} selected case{chosen.length === 1 ? '' : 's'}</button>
          <p className="muted">Nothing is saved until you select Restore. Evidence labels, dates, notes, and SHA-256 receipts are kept as recorded.</p>
        </div>
      )}
    </section>
  )
}
