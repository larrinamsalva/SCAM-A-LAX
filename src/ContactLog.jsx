import { useRef, useState } from 'react'
import { CONTACT_ANSWERS, CONTACT_BASES, CONTACT_BEHAVIORS, CONTACT_CHANNELS, contactRecordText, hasContactDraft, reviewContactDraft, saveContactRecord } from './contact-records.js'
import { STORY_LIMIT, validateCaseFile } from './case-workflow.js'
import { isScreenshotFile } from './screenshots.js'
import Screenshot, { SelectedScreenshot } from './Screenshot.jsx'
import './contact-log.css'

export default function ContactLog({ item, draft, onChange, onSaved, saving, onBusyChange, onOpenPacket }) {
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const busy = useRef(false)
  const fileInput = useRef(null)
  const heading = useRef(null)
  const confirmationRef = useRef(null)
  const contacts = (item.evidence || []).filter((record) => record.contact?.schema === 'scamalax.contact.v1')
  const update = (key, value) => { setError(''); setConfirmation(''); setReviewing(false); onChange({ ...draft, [key]: value }) }
  const submit = async (event) => {
    event.preventDefault()
    if (busy.current || saving) return
    try {
      reviewContactDraft(draft)
      validateCaseFile(draft.file, draft.keepScreenshot)
      if (!reviewing) {
        setReviewing(true)
        requestAnimationFrame(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'start' }) })
        return
      }
    } catch (cause) { setError(cause.message); return }
    busy.current = true
    onBusyChange(true)
    setError('')
    try {
      const result = await saveContactRecord(item.id, draft)
      onSaved(result)
      setReviewing(false)
      if (fileInput.current) fileInput.current.value = ''
      setConfirmation('Contact record saved in this case and this browser.')
      requestAnimationFrame(() => { confirmationRef.current?.focus(); confirmationRef.current?.scrollIntoView({ block: 'start' }) })
    } catch (cause) {
      const reason = cause.name === 'QuotaExceededError' ? 'Browser storage is full. Keep your original and download a backup before making space.' :
        cause.name === 'SecurityError' || cause.name === 'InvalidStateError' ? 'Browser storage is unavailable. Keep your original and try a browser that allows storage.' : cause.message
      setError(`The contact record was not saved. Your draft is still here. ${reason}`)
    } finally { busy.current = false; onBusyChange(false) }
  }
  const discard = () => {
    if (hasContactDraft(draft) && !window.confirm('Discard this unsaved contact note and selected file? Your saved records will stay unchanged.')) return
    onChange(null)
    setReviewing(false); setError(''); setConfirmation('')
    if (fileInput.current) fileInput.current.value = ''
  }
  let reviewed
  try { if (reviewing) reviewed = reviewContactDraft(draft) } catch { /* Submit reports validation errors. */ }
  const textField = (key, label, limit, placeholder = '') => <div className="record-field">
    <label htmlFor={`contact-${key}`}>{label}</label>
    <input id={`contact-${key}`} value={draft[key]} maxLength={limit} placeholder={placeholder} onChange={(event) => update(key, event.target.value)} />
  </div>

  return <div className="module-grid contact-log">
    <section className="panel contact-log-form" aria-labelledby="contact-log-heading">
      <span className="kicker">KEEP EACH CONTACT TOGETHER</span>
      <h2 id="contact-log-heading" ref={heading} tabIndex={-1}>{reviewing ? 'Review contact record' : 'Save a call or message'}</h2>
      {reviewing ? <p className="muted">Check your words and source details. Choose Back to contact details to correct anything before saving.</p> : <><ol className="contact-directions"><li>Write down one call or message. Unknown details can stay blank.</li><li>Review your note, then save it in this case.</li><li>Use Case Packet or Backup workspace to keep a downloadable copy.</li></ol><p className="muted">These are notes you enter. The app does not record a live call. Keep original messages, call history, receipts, and files alongside your notes.</p></>}
      {confirmation && <p className="case-saved-confirmation" role="status" ref={confirmationRef} tabIndex={-1}>{confirmation}</p>}
      <form onSubmit={submit}>
        <fieldset disabled={saving}>
          {!reviewing && <>
            <div className="two-col">
              <div className="record-field"><label htmlFor="contact-channel">Contact type</label><select id="contact-channel" value={draft.channel} onChange={(event) => update('channel', event.target.value)}>{CONTACT_CHANNELS.map((channel) => <option key={channel}>{channel}</option>)}</select></div>
              <div className="record-field"><label htmlFor="contact-basis">How do you know what was said?</label><select id="contact-basis" value={draft.basis} onChange={(event) => update('basis', event.target.value)}>{CONTACT_BASES.map((basis) => <option key={basis}>{basis}</option>)}</select></div>
            </div>
            <div className="record-field"><label htmlFor="contact-whatHappened">What was said or sent?</label><textarea id="contact-whatHappened" value={draft.whatHappened} maxLength={STORY_LIMIT} rows={6} required onChange={(event) => update('whatHappened', event.target.value)} aria-describedby="contact-words-help" placeholder="Paste the message, or describe the call in your own words…" /><small id="contact-words-help">If you are quoting from memory, say so. Leave out passwords, sign-in codes, and full account numbers.</small></div>
            <div className="two-col"><div className="record-field"><label htmlFor="contact-date">Contact date (optional)</label><input id="contact-date" type="date" value={draft.date} onChange={(event) => update('date', event.target.value)} /></div><div className="record-field"><label htmlFor="contact-time">Contact time (optional)</label><input id="contact-time" type="time" value={draft.time} onChange={(event) => update('time', event.target.value)} /></div></div>
            {textField('timeZone', 'Time zone (optional)', 80, 'For example: Pacific time, or leave blank')}
            {textField('sender', 'Displayed number, email, or sender (optional)', 500, 'Copy what your call history or message shows')}
            {textField('callbackNumber', 'Number they told you to call back (optional)', 500)}
            {textField('claimedIdentity', 'Claimed name or organization (optional)', 300)}
            <small>Displayed numbers can be spoofed. Keep a claimed identity separate from anything you have verified.</small>
            {textField('language', 'Language used (if known)', 160, 'For example: English, Hindi, Spanish, or not sure')}
            <small>Record only the language you know was used. Language or accent does not establish nationality or whether a contact is a scam.</small>
            <details className="contact-optional" open={Boolean(draft.location || draft.paymentRequest || CONTACT_BEHAVIORS.some(({ key }) => draft[key]))}>
              <summary>Store, payment, and phone-pressure details (optional)</summary>
              {textField('location', 'Store, bank, or destination (optional)', 500)}
              {textField('paymentRequest', 'Payment they requested (optional)', 1000, 'Amount, payment method, or what they wanted you to buy')}
              {CONTACT_BEHAVIORS.map(({ key, label }) => <div className="record-field" key={key}><label htmlFor={`contact-${key}`}>{label}</label><select id={`contact-${key}`} value={draft[key]} onChange={(event) => update(key, event.target.value)}>{Object.entries(CONTACT_ANSWERS).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></div>)}
            </details>
            <div className="record-field"><label htmlFor="contact-actionsTaken">What did you do next? (optional)</label><textarea id="contact-actionsTaken" rows={3} value={draft.actionsTaken} maxLength={3000} onChange={(event) => update('actionsTaken', event.target.value)} placeholder="For example: ended the call, spoke with the cashier, or contacted my bank…" /></div>
            <div className="record-field"><label htmlFor="contact-file">Screenshot or original file for this contact (optional)</label><input id="contact-file" type="file" ref={fileInput} onChange={(event) => update('file', event.target.files?.[0] || null)} aria-describedby="contact-file-help" /><small id="contact-file-help">PNG, JPG, or WebP up to 10 MB can be kept as viewable copies. Other files up to 25 MB keep a receipt only; keep their original bytes yourself. Nothing is uploaded.</small></div>
            {draft.file && <p className="case-file-selection">Selected: <strong>{draft.file.name}</strong> <button type="button" onClick={() => { if (fileInput.current) fileInput.current.value = ''; update('file', null) }}>Remove contact file</button></p>}
            {isScreenshotFile(draft.file) && <><SelectedScreenshot file={draft.file} /><label className="screenshot-choice"><input type="checkbox" checked={draft.keepScreenshot} onChange={(event) => update('keepScreenshot', event.target.checked)} /><span>Keep a viewable screenshot with this contact<small>Included in JSON backups. Image text is not read automatically.</small></span></label></>}
          </>}
          {reviewing && reviewed && <>
            <pre className="contact-record-text">{contactRecordText(reviewed)}</pre>
            {draft.file && <p>Attachment: <strong>{draft.file.name}</strong> · {draft.keepScreenshot && isScreenshotFile(draft.file) ? 'viewable screenshot and original-byte receipt' : 'receipt only; keep the original file yourself'}</p>}
            <p className="contact-save-boundary">This saves a user-entered statement and any selected file receipt. The contact date and time stay as you entered them; the saved time is recorded separately. Review before sharing with a lawyer, law enforcement, or anyone helping you. Saving does not submit a report or certify evidence.</p>
          </>}
          {error && <p role="alert" className="record-save-error">{error}</p>}
          <div className="button-row">{reviewing && <button type="button" onClick={() => setReviewing(false)}>Back to contact details</button>}<button type="submit" className="primary">{saving ? 'Saving contact record…' : reviewing ? 'Save contact record' : 'Review contact record'}</button><button type="button" onClick={discard}>Discard contact draft</button></div>
        </fieldset>
      </form>
    </section>
    <section className="panel" aria-labelledby="saved-contacts-heading">
      <span className="kicker">THIS CASE’S CONTACT HISTORY</span><h2 id="saved-contacts-heading" aria-live="polite">{contacts.length} saved contact{contacts.length === 1 ? '' : 's'}</h2>
      <p className="muted">Case: {item.title} · {item.id}. Each entry is also kept in Scam Ledger and included in case downloads.</p>
      <button type="button" disabled={saving || !contacts.length} onClick={onOpenPacket}>Open case packet downloads</button>
      {!contacts.length && <p className="muted empty">No contact notes yet. Your other case records are unchanged. Use this form for each call or message you want to keep.</p>}
      <div className="evidence-list">
        {contacts.map((record) => <article className="evidence-card contact-saved-record" key={record.id}>
          <h3>{record.contact.channel} · {record.contact.date || 'Contact date not supplied'}</h3>
          <p className="case-source-label">User statement · not independently verified</p>
          <p className="muted">Saved in this browser: <time dateTime={record.recordedAt}>{record.recordedAt}</time></p>
          <pre className="contact-record-text">{record.value}</pre>
          <small>Record ID: {record.id}</small><code>Record text sha256:{record.sha256}</code>
          {(item.evidence || []).filter((file) => file.relatedContactId === record.id).map((file) => <div className="contact-attachment" key={file.id}><strong>{file.fileName}</strong><small>{file.fileSize} bytes · File receipt: {file.id}</small>{file.screenshot?.id && <Screenshot record={file} />}<code>Original file sha256:{file.sha256}</code></div>)}
          {(item.evidence || []).filter((note) => note.correctsRecordId === record.id).map((note) => <div className="contact-attachment" key={note.id}><strong>Clarification saved at {note.recordedAt}</strong><p className="contact-record-text">{note.value}</p><small>Record ID: {note.id} · Original contact retained</small><code>Clarification sha256:{note.sha256}</code></div>)}
        </article>)}
      </div>
      <p className="muted">Keep a backup before clearing browser data. These notes are local to this browser and are not encrypted.</p>
      <p className="muted">Use Scam Ledger to add a clarification to an entry. The original statement and its receipt stay unchanged.</p>
    </section>
  </div>
}
