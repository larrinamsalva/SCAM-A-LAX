import { useEffect, useRef, useState } from 'react'
import { CASE_CATEGORIES, CONTACT_LIMIT, STORY_LIMIT, hasCaseDraft, reviewCaseDraft, saveCaseWithStory, validateCaseFile } from './case-workflow.js'
import { isScreenshotFile } from './screenshots.js'
import { SelectedScreenshot } from './Screenshot.jsx'
import './case-guide.css'

export default function NewCaseForm({ draft, onChange, onSaved, onBeforeSave, onDiscard, onBusyChange }) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const heading = useRef(null)
  const fileInput = useRef(null)

  useEffect(() => { if (draft.open) heading.current?.focus({ preventScroll: true }) }, [draft.open, draft.step])

  const update = (key, value) => { setError(''); onChange({ ...draft, [key]: value }) }
  const advance = (event) => {
    event.preventDefault()
    try { reviewCaseDraft(draft); validateCaseFile(draft.file, draft.keepScreenshot); update('step', draft.step + 1) }
    catch (cause) { setError(cause.message) }
  }
  const save = async (event) => {
    event.preventDefault()
    if (busy.current || !onBeforeSave()) return
    busy.current = true
    setSaving(true)
    onBusyChange(true)
    setError('')
    try {
      const result = await saveCaseWithStory(draft)
      onSaved(result)
      if (fileInput.current) fileInput.current.value = ''
    } catch (cause) {
      const reason = cause.name === 'QuotaExceededError' ? 'Browser storage is full. Keep your original file and download a backup before making space.' :
        cause.name === 'SecurityError' || cause.name === 'InvalidStateError' ? 'Browser storage is unavailable. Keep your original file and use a browser that allows storage.' : cause.message
      setError(`The case and story were not saved. Your draft is still here. ${reason}`)
    } finally { busy.current = false; setSaving(false); onBusyChange(false) }
  }
  const discard = () => {
    if (hasCaseDraft(draft) && !window.confirm('Discard this unsaved case draft? Your saved cases will stay unchanged.')) return
    setError('')
    if (fileInput.current) fileInput.current.value = ''
    onDiscard()
  }
  let review
  try { if (draft.step === 2) review = reviewCaseDraft(draft) } catch { /* Saving reports invalid draft data. */ }

  return <section className="panel case-guide" hidden={!draft.open} aria-labelledby="new-case-heading">
    <div className="section-heading"><div><span className="kicker">YOUR STORY, KEPT TOGETHER</span><h2 id="new-case-heading" ref={heading} tabIndex={-1}>Save a new case</h2></div><button type="button" disabled={saving} onClick={() => update('open', false)}>Close for now</button></div>
    <ol className="case-guide-steps" aria-label="New case steps">{['Your story', 'Supporting details', 'Review and save'].map((step, index) => <li key={step} aria-current={draft.step === index ? 'step' : undefined}><span>{index + 1}</span>{step}</li>)}</ol>
    <p className="muted">Your case and story are saved together when you select <strong>Save case</strong>. This draft stays in memory while you move around this tab; refreshing discards it.</p>
    <form onSubmit={draft.step === 2 ? save : advance}>
      <fieldset disabled={saving}>
        {draft.step === 0 && <>
          <h3>1. Tell your story</h3>
          <label htmlFor="case-story">What happened?</label><textarea id="case-story" rows={6} value={draft.story} maxLength={STORY_LIMIT} required onChange={(event) => update('story', event.target.value)} aria-describedby="case-story-note" placeholder="Describe the message, call, purchase, or other incident in your own words…" />
          <small id="case-story-note">Your statement will be kept as a record, not treated as independently verified. Leave out passwords, sign-in codes, and full account numbers.</small>
          <label htmlFor="new-case-name">Case name (optional)</label><input id="new-case-name" value={draft.name} maxLength={160} onChange={(event) => update('name', event.target.value)} placeholder="For example: Suspicious delivery text" /><small>Leave this blank and we’ll name the case for you. Every saved case also gets a unique ID.</small>
          <label htmlFor="case-category">Scam category</label><select id="case-category" value={draft.category} onChange={(event) => update('category', event.target.value)}>{CASE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
          <div className="two-col"><div className="record-field"><label htmlFor="case-incident-date">When did it happen? (optional)</label><input id="case-incident-date" type="date" value={draft.incidentDate} onChange={(event) => update('incidentDate', event.target.value)} /></div><div className="record-field"><label htmlFor="case-loss">Approximate money lost in USD (optional)</label><input id="case-loss" inputMode="decimal" value={draft.loss} maxLength={16} onChange={(event) => update('loss', event.target.value)} placeholder="For example: 25.50" /><small>Leave blank if you don’t know; enter 0 if no money was lost.</small></div></div>
        </>}
        {draft.step === 1 && <>
          <h3>2. Add supporting details</h3><p>Everything here is optional. You can add more records after saving.</p>
          <label htmlFor="case-contacts">Contact details or identifiers (optional)</label><textarea id="case-contacts" rows={3} value={draft.contacts} maxLength={CONTACT_LIMIT} onChange={(event) => update('contacts', event.target.value)} placeholder="Phone numbers, email addresses, usernames, or links involved…" /><small>These are details you supplied, not verified identities. Links are kept as text and never opened.</small>
          <label htmlFor="case-first-file">Screenshot or original file for this case (optional)</label><input id="case-first-file" ref={fileInput} type="file" onChange={(event) => update('file', event.target.files?.[0] || null)} aria-describedby="case-first-file-note" />
          <small id="case-first-file-note">PNG, JPG, and WebP screenshots up to 10 MB can be kept as viewable copies. Other files up to 25 MB keep metadata and a hash receipt only. Nothing is uploaded.</small>
          {draft.file && <p className="case-file-selection">Selected: <strong>{draft.file.name}</strong> ({draft.file.size.toLocaleString()} bytes) <button type="button" onClick={() => { if (fileInput.current) fileInput.current.value = ''; update('file', null) }}>Remove selected file</button></p>}
          {isScreenshotFile(draft.file) && <><SelectedScreenshot file={draft.file} /><label className="screenshot-choice"><input type="checkbox" checked={draft.keepScreenshot} onChange={(event) => update('keepScreenshot', event.target.checked)} /><span>Keep a viewable screenshot with this case<small>Included in JSON backups. Uncheck to keep only a receipt. Image text is not read automatically.</small></span></label></>}
        </>}
        {draft.step === 2 && review && <>
          <h3>3. Review and save</h3><dl className="case-review"><dt>Case name</dt><dd>{review.name || 'Automatically named when saved'}</dd><dt>Category</dt><dd>{review.category}</dd><dt>Incident date</dt><dd>{review.incidentDate || 'Not provided'}</dd><dt>Approximate loss</dt><dd>{review.reportedLoss ? `${review.reportedLoss.amount} USD` : 'Not provided'}</dd><dt>Your story</dt><dd className="case-review-story">{review.story}</dd>{review.contacts && <><dt>Contact details</dt><dd className="case-review-story">{review.contacts}</dd></>}{draft.file && <><dt>Attachment</dt><dd>{draft.file.name} · {draft.keepScreenshot && isScreenshotFile(draft.file) ? 'viewable screenshot and original-byte receipt' : 'receipt only; original file bytes will not be stored'}</dd></>}</dl>
          <p className="case-save-boundary"><strong>{1 + Number(Boolean(review.contacts)) + Number(Boolean(draft.file))} record(s)</strong> will be saved with this case in this browser. This does not submit a report. Browser storage is not encrypted; keep a backup and original files.</p>
        </>}
        {error && <p className="record-save-error" role="alert">{error}</p>}
        <div className="button-row">{draft.step > 0 && <button type="button" onClick={() => update('step', draft.step - 1)}>{draft.step === 1 ? 'Back to story' : 'Back to evidence'}</button>}<button type="submit" className="primary">{saving ? 'Saving case…' : draft.step === 0 ? 'Continue to evidence' : draft.step === 1 ? 'Review case' : 'Save case'}</button><button type="button" className="case-discard" onClick={discard}>Discard draft</button></div>
      </fieldset>
    </form>
  </section>
}
