import { useEffect, useId, useRef, useState } from 'react'
import { getScreenshot, screenshotType, SCREENSHOT_LIMIT } from './screenshots.js'
import './screenshots.css'

export function SelectedScreenshot({ file }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    let next
    setUrl('')
    setError('')
    if (!file) return
    if (file.size > SCREENSHOT_LIMIT) { setError('Choose a screenshot smaller than 10 MB to keep a viewable copy.'); return }
    file.arrayBuffer().then(async (bytes) => {
      if (cancelled) return
      const type = screenshotType(bytes)
      if (!type) throw new Error('This file is not a PNG, JPG, or WebP screenshot.')
      next = URL.createObjectURL(new Blob([bytes], { type }))
      const image = new Image()
      image.src = next
      await image.decode()
      if (!cancelled) setUrl(next)
    }).catch(() => { if (!cancelled) setError('This image cannot be previewed. Choose a valid PNG, JPG, or WebP screenshot.') })
    return () => { cancelled = true; if (next) URL.revokeObjectURL(next) }
  }, [file])
  return error ? <p className="record-save-error">{error}</p> : url && <img className="screenshot-selected" src={url} alt="Selected screenshot preview" />
}

export default function Screenshot({ record }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const dialog = useRef(null)
  const trigger = useRef(null)
  const titleId = useId()
  useEffect(() => {
    let cancelled = false
    let objectUrl
    setUrl('')
    setError('')
    getScreenshot(record.screenshot.id).then((image) => {
      if (cancelled) return
      if (!image?.blob) { setError('The saved image is missing from this browser. Its file receipt is still in your case.'); return }
      objectUrl = URL.createObjectURL(image.blob)
      setUrl(objectUrl)
    }).catch(() => { if (!cancelled) setError('The saved image could not be loaded. Its file receipt is still in your case.') })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [record.screenshot.id])

  useEffect(() => { if (expanded && !dialog.current.open) dialog.current.showModal() }, [expanded])
  const close = () => { dialog.current?.close(); setExpanded(false); trigger.current?.focus({ preventScroll: true }) }
  return <div className="saved-screenshot">
    {error ? <p role="alert">{error}</p> : !url ? <p role="status">Loading saved screenshot…</p> : <>
      <button ref={trigger} type="button" className="screenshot-thumbnail" aria-label={`View screenshot ${record.fileName}`} onClick={() => setExpanded(true)}><img src={url} alt={`Saved screenshot: ${record.fileName}`} loading="lazy" /></button>
      <div className="button-row"><button type="button" onClick={() => { trigger.current?.click() }}>View screenshot</button><a className="screenshot-download" href={url} download={record.fileName}>Download original image</a></div>
      {expanded && <dialog ref={dialog} className="screenshot-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close() }} onClick={(event) => { if (event.target === event.currentTarget) close() }}>
        <div className="screenshot-dialog-body"><header><h2 id={titleId}>{record.fileName}</h2><button type="button" autoFocus onClick={close} aria-label="Close screenshot">×</button></header><img src={url} alt={`Full screenshot: ${record.fileName}`} /><a className="screenshot-download" href={url} download={record.fileName}>Download original image</a></div>
      </dialog>}
    </>}
  </div>
}
