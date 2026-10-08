import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { academyChoices, getSupportSteps, lessons, officialResources, supportOptions } from './academy.js'
import { analyzeMessage, MESSAGE_LIMIT } from './scamcheck.js'
import { VERSION } from './version.js'
import HelpAgent from './HelpAgent.jsx'
import ScamRadar from './ScamRadar.jsx'
import './edition.css'

const Workstation = lazy(() => import('./AppV3.jsx'))
const NumberTracker = lazy(() => import('./NumberTracker.jsx'))
const PROGRESS_KEY = 'scamalax.learning.v1'
const routes = [['home', 'Overview'], ['guide', 'Start here'], ['check', 'Check a message'], ['numbers', 'Number tracker'], ['help', 'Get help'], ['academy', 'Scam Academy'], ['cases', 'My cases']]

function readRoute() {
  const route = window.location.hash.slice(1)
  return routes.some(([id]) => id === route) ? route : 'home'
}

function loadProgress() {
  const empty = { answers: {}, situations: [], checks: {} }
  try {
    const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null')
    if (!parsed || parsed.schema !== 1) return empty
    return {
      answers: Object.fromEntries(lessons.filter((lesson) => academyChoices.some((choice) => choice.id === parsed.answers?.[lesson.id])).map((lesson) => [lesson.id, parsed.answers[lesson.id]])),
      situations: supportOptions.filter((option) => Array.isArray(parsed.situations) && parsed.situations.includes(option.id)).map((option) => option.id),
      checks: Object.fromEntries(getSupportSteps(supportOptions.map((option) => option.id)).map((step) => [step.id, parsed.checks?.[step.id] === true])),
    }
  } catch {
    return empty
  }
}

function Icon({ name, size = 24 }) {
  const paths = {
    shield: <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
    check: <><path d="M4 4h16v12H9l-5 4Z" /><path d="m8 10 3 3 5-6" /></>,
    help: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="m5.6 5.6 3.6 3.6m5.6 5.6 3.6 3.6m0-12.8-3.6 3.6m-5.6 5.6-3.6 3.6" /></>,
    folder: <path d="M3 6h7l2 3h9v11H3Z" />,
    book: <><path d="M12 6c-3-3-7-3-10-2v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 2Z" /><path d="M12 6v15" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.shield}</svg>
}

function ResourceLinks() {
  return <div className="ed-resources"><span>Official U.S. resources</span>{officialResources.map((item) => <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer">{item.title} ↗</a>)}</div>
}

function Overview({ go, completed }) {
  return <>
    <section className="ed-hero">
      <div className="ed-hero-copy">
        <div className="ed-eyebrow"><span className="ed-dot" /> LARRINA’S EDITION</div>
        <h1>A little pause.<br /><em>A lot more protection.</em></h1>
        <p>A suspicious text. A pushy caller. An offer that feels off. Get a clearer view of the warning signs and decide what to do next.</p>
        <div className="ed-button-row"><button className="ed-primary" onClick={() => go('check')}>Check a message <Icon name="arrow" size={18} /></button><button className="ed-secondary" onClick={() => go('help')}>I need help now</button></div>
        <div className="ed-hero-note"><Icon name="shield" size={17} /> Message checks run on this device. No account needed.</div>
        <button className="ed-guide-link" onClick={() => go('guide')}>New here? Follow the step-by-step guide <Icon name="arrow" size={18} /></button>
      </div>
      <div className="ed-example" aria-label="Fictional message example showing three warning signs">
        <div className="ed-example-top"><span>SPOT THE PATTERN</span><span>Fictional example</span></div>
        <div className="ed-message-bubble">“Buy gift cards <mark>right now</mark>. Send me the codes and <mark>don’t tell anyone</mark>.”</div>
        <div className="ed-example-result"><span className="ed-icon ed-icon-lilac"><Icon name="shield" /></span><div><strong>Three reasons to pause</strong><small>A request deserves a closer look.</small></div></div>
        <ul className="ed-example-flags"><li>Gift-card codes as payment</li><li>Pressure to act immediately</li><li>Instructions to keep it secret</li></ul>
        <div className="ed-example-bottom">Slow down. Check independently. Keep your information.</div>
      </div>
    </section>
    <section className="ed-start" aria-labelledby="start-title">
      <div className="ed-section-title"><div><span className="ed-eyebrow">START WHERE YOU ARE</span><h2 id="start-title">What’s on your mind?</h2></div><span className="ed-small">One clear next step.</span></div>
      <div className="ed-paths">
        {[
          { route: 'check', icon: 'check', color: 'lilac', title: 'Does this look suspicious?', body: 'Check a message and see the words that triggered each warning.', label: 'Check a message' },
          { route: 'help', icon: 'help', color: 'peach', title: 'Something already happened.', body: 'Choose your situation and work through a practical response checklist.', label: 'Build my next steps' },
          { route: 'cases', icon: 'folder', color: 'mint', title: 'I want to keep a record.', body: 'Organize evidence, keep file-hash receipts, and prepare a report to share.', label: 'Open my cases' },
        ].map((item) => <button key={item.route} className="ed-path" onClick={() => go(item.route)}><span className={`ed-icon ed-icon-${item.color}`}><Icon name={item.icon} /></span><h3>{item.title}</h3><p>{item.body}</p><span className="ed-path-link">{item.label} <Icon name="arrow" size={18} /></span></button>)}
      </div>
    </section>
    <section className="ed-academy-banner"><span className="ed-icon ed-icon-lilac"><Icon name="book" /></span><div><span className="ed-eyebrow">A LITTLE PRACTICE GOES A LONG WAY</span><h2>Build your scam-spotting instincts.</h2><p>20 fictional situations. Clear explanations. {completed ? `${completed} of 20 practiced on this device.` : 'Learn at your own pace.'}</p></div><button className="ed-secondary" onClick={() => go('academy')}>Try Scam Academy <Icon name="arrow" size={18} /></button></section>
  </>
}

function StartHere({ go }) {
  const steps = [
    { id: 'case', title: 'Create a case folder', body: <><p>Open <strong>My cases</strong>, enter a short <strong>Case title</strong>, then select <strong>+ New case</strong>. For example: “Suspicious delivery text.”</p><p>A case is a folder for this incident. Creating it does not save your story yet.</p></> },
    { id: 'story', title: 'Save what happened', body: <><p>Inside your case, open <strong>Scam Ledger</strong>. Choose <strong>Kind → note</strong> for your story, or <strong>message</strong> for a message you received.</p><p>Fill in <strong>Message or what happened</strong>, then select <strong>Save record</strong>. You can add more records to the same case later.</p></> },
    { id: 'check', title: 'Check that your record was added', body: <><p>Your words should appear in the saved records list. After your first save, the count changes from <strong>0 saved records</strong> to <strong>1 saved record</strong>.</p><p>If it still shows zero, the case exists but your story has not been added yet.</p></> },
    { id: 'backup', title: 'Keep a backup', body: <><p>Select <strong>Backup workspace</strong> to download your cases, including screenshots saved with a viewable copy. Keep that file somewhere you can find it.</p><p>Cases stay in this browser on this device. Keep original files separately too. Files saved as receipts only are not included as images.</p></> },
    { id: 'report', title: 'Prepare a report when you are ready', body: <><p>Open <strong>Case Packet</strong>. On a phone, swipe the tab row that starts with Scam Ledger to find it.</p><p>Choose <strong>Download Markdown packet</strong> for a text report, or <strong>Download JSON archive</strong> for a structured copy. Review the file before deciding who to share it with. Downloading a report does not send it anywhere.</p></> },
  ]
  return <div className="ed-narrow">
    <div className="ed-page-title"><span className="ed-eyebrow">START HERE</span><h1>Your first case, step by step.</h1><p>Keep your story and supporting details together. You can follow these directions at your own pace.</p></div>
    <section className="ed-guide-note"><h2>Need help with something that already happened?</h2><p>Start with the situation checklist in Get help, then come back to keep your records.</p><button className="ed-secondary" onClick={() => go('help')}>Open Get help <Icon name="arrow" size={18} /></button></section>
    <ol className="ed-guide-steps" aria-label="Case directions">
      {steps.map((step, index) => <li key={step.id} className="ed-card"><span className="ed-guide-number" aria-hidden="true">{index + 1}</span><div><h2>{step.title}</h2>{step.body}</div></li>)}
    </ol>
    <section className="ed-card"><h2>Ready to keep your story?</h2><button className="ed-primary" onClick={() => go('cases')}>Open My cases <Icon name="folder" size={18} /></button><p className="ed-small">The case page has a “How to save your first record” reminder you can open without leaving your form.</p></section>
    <section className="ed-card"><h2>Want to check a message first?</h2><p>Check a message looks for warning signs in the words you enter. It does not search a shared scam-report database or save the message. Copy any text you want to keep before leaving that page, then add it to your case as a record.</p><button className="ed-secondary" onClick={() => go('check')}>Open message check <Icon name="check" size={18} /></button></section>
  </div>
}

function MessageCheck({ go }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const resultRef = useRef(null)
  const check = (event) => {
    event.preventDefault()
    setResult(analyzeMessage(text))
    requestAnimationFrame(() => resultRef.current?.focus())
  }
  return <div className="ed-narrow">
    <div className="ed-page-title"><span className="ed-eyebrow">SCAMCHECK</span><h1>Let’s look at the message.</h1><p>Get an explanation of common warning signs. You can do this without opening a case.</p></div>
    <form className="ed-card ed-check-form" onSubmit={check}>
      <label htmlFor="message-text">Message, email, or call notes</label><p id="message-privacy" className="ed-small">Remove passwords, codes, and account numbers first. This check stays in memory and isn’t saved or uploaded. Pasted links are never opened.</p>
      <textarea id="message-text" aria-describedby="message-privacy" rows={8} maxLength={MESSAGE_LIMIT} value={text} onChange={(event) => { setText(event.target.value); setResult(null) }} placeholder="Paste the words that made you pause…" required />
      <div className="ed-form-footer"><span className="ed-small">{text.length.toLocaleString()} / {MESSAGE_LIMIT.toLocaleString()} characters</span><div className="ed-button-row"><button type="button" className="ed-secondary" onClick={() => { setText(''); setResult(null) }}>Clear</button><button className="ed-primary" disabled={!text.trim()}>Check this message <Icon name="arrow" size={18} /></button></div></div>
    </form>
    {result && <section ref={resultRef} tabIndex={-1} className="ed-card ed-results" aria-labelledby="check-result-title">
      <span className="ed-eyebrow">PATTERN CHECK · HUMAN REVIEW NEEDED</span><h2 id="check-result-title">{result.findings.length ? `${result.findings.length} warning sign${result.findings.length === 1 ? '' : 's'} to review` : 'No known patterns matched. Safety is still unverified.'}</h2>
      <ScamRadar result={result} />
      <p>This is a local text check, not an identity check or a verdict. It can miss scams and flag legitimate messages. Verify requests through a contact you already trust.</p>
      <div className="ed-findings">{result.findings.map((finding) => <article key={finding.id}><div className="ed-finding-heading"><Icon name="shield" size={19} /><h3>{finding.label}</h3></div><div className="ed-excerpt">Matched words: <q>{finding.excerpt}</q></div><p>{finding.why}</p><p className="ed-next-step"><strong>Next step:</strong> {finding.action}</p></article>)}</div>
      <div className="ed-button-row"><button className="ed-primary" onClick={() => go('help')}>Build my next steps</button><button className="ed-secondary" onClick={() => go('cases')}>Open My cases to save a record</button></div><p className="ed-small">Opening My cases does not automatically save this message or its analysis. Copy any text you want to keep before leaving this page.</p>
    </section>}
    <p className="ed-reassurance">Feeling uncertain is a good reason to slow down. You don’t have to decide while someone is pressuring you.</p>
  </div>
}

function GetHelp({ progress, update, go }) {
  const steps = getSupportSteps(progress.situations)
  const done = steps.filter((step) => progress.checks[step.id]).length
  return <div className="ed-narrow">
    <div className="ed-page-title"><span className="ed-eyebrow">ONE STEP AT A TIME</span><h1>You can take the next step.</h1><p>Scams are designed to manipulate people. Start with what happened and focus on regaining control.</p></div>
    <section className="ed-card"><h2>What happened?</h2><p className="ed-small">Choose all that apply, or use the general checklist below.</p><div className="ed-situations">{supportOptions.map((option) => <label key={option.id} className={progress.situations.includes(option.id) ? 'is-selected' : ''}><input type="checkbox" checked={progress.situations.includes(option.id)} onChange={(event) => update((current) => ({ ...current, situations: event.target.checked ? [...current.situations, option.id] : current.situations.filter((id) => id !== option.id) }))} /><span><strong>{option.title}</strong><small>{option.detail}</small></span></label>)}</div></section>
    <section className="ed-card ed-help-steps"><div className="ed-section-title"><h2>Your next steps</h2><span className="ed-small" aria-live="polite">{done} of {steps.length} checked</span></div><progress value={done} max={steps.length} aria-label="Response checklist progress" /><div className="ed-step-list">{steps.map((step, index) => <label key={step.id} className={progress.checks[step.id] ? 'is-done' : ''}><input type="checkbox" checked={Boolean(progress.checks[step.id])} onChange={(event) => update((current) => ({ ...current, checks: { ...current.checks, [step.id]: event.target.checked } }))} /><span><strong>{index + 1}. {step.title}</strong><small>{step.detail}</small></span></label>)}</div><div className="ed-button-row"><button className="ed-primary" onClick={() => go('cases')}>Organize a local case <Icon name="folder" size={18} /></button><button className="ed-secondary" onClick={() => update((current) => ({ ...current, checks: {} }))}>Reset checkmarks</button></div></section>
    <div className="ed-help-note">If someone is in immediate danger, contact the emergency service for your location. A completed checklist records your progress; it does not confirm an account or device is secure.</div>
    <ResourceLinks />
  </div>
}

function Academy({ progress, update }) {
  const [category, setCategory] = useState('All topics')
  const [lessonId, setLessonId] = useState(lessons[0].id)
  const filtered = category === 'All topics' ? lessons : lessons.filter((lesson) => lesson.category === category)
  const lesson = filtered.find((item) => item.id === lessonId) || filtered[0]
  const index = filtered.findIndex((item) => item.id === lesson.id)
  const answer = progress.answers[lesson.id]
  const completed = Object.keys(progress.answers).length
  const move = (next) => setLessonId(filtered[next].id)
  return <>
    <div className="ed-page-title"><span className="ed-eyebrow">SCAM ACADEMY</span><h1>Practice the pause.</h1><p>Try 20 fictional situations. Choose a next step, then learn the reason behind it.</p></div>
    <div className="ed-academy-layout">
      <aside className="ed-card ed-lesson-picker"><div className="ed-section-title"><h2>Your practice</h2><span className="ed-small">{completed} / 20</span></div><progress value={completed} max={lessons.length} aria-label="Scam Academy progress" /><label htmlFor="lesson-topic">Topic</label><select id="lesson-topic" value={category} onChange={(event) => setCategory(event.target.value)}>{['All topics', ...new Set(lessons.map((item) => item.category))].map((topic) => <option key={topic}>{topic}</option>)}</select><nav className="ed-lesson-list" aria-label="Practice scenarios">{filtered.map((item, itemIndex) => <button key={item.id} className={lesson.id === item.id ? 'is-active' : ''} aria-current={lesson.id === item.id ? 'step' : undefined} onClick={() => setLessonId(item.id)}><span className="ed-lesson-number">{progress.answers[item.id] ? '✓' : String(itemIndex + 1).padStart(2, '0')}</span><span>{item.title}</span></button>)}</nav><p className="ed-small">Only practice answers and checklist progress are saved here. Message checks aren’t saved.</p></aside>
      <section className="ed-card ed-lesson" aria-labelledby="lesson-title"><div className="ed-lesson-meta"><span className="ed-eyebrow">{lesson.category}</span><span className="ed-small">{index + 1} of {filtered.length} in this topic</span></div><h2 id="lesson-title">{lesson.title}</h2><div className="ed-scenario"><span>FICTIONAL SCENARIO</span><p>{lesson.message}</p></div><h3>What would you do next?</h3><div className="ed-answer-options">{academyChoices.map((choice) => <button key={choice.id} disabled={Boolean(answer)} className={answer === choice.id ? 'is-chosen' : ''} onClick={() => update((current) => ({ ...current, answers: { ...current.answers, [lesson.id]: choice.id } }))}>{choice.label}</button>)}</div>
        {answer && <div className="ed-feedback" role="status"><strong>{answer === lesson.answer ? 'That’s the next step we recommend.' : 'Here’s a better next step to consider.'}</strong><p>{lesson.why}</p><small>Recommended: {academyChoices.find((choice) => choice.id === lesson.answer).label}</small><button className="ed-text-button" onClick={() => update((current) => { const answers = { ...current.answers }; delete answers[lesson.id]; return { ...current, answers } })}>Try this scenario again</button></div>}
        <div className="ed-lesson-controls"><button className="ed-secondary" onClick={() => move(index - 1)} disabled={index === 0}>Previous</button><button className="ed-primary" onClick={() => move(index + 1)} disabled={index === filtered.length - 1}>Next scenario <Icon name="arrow" size={18} /></button></div><p className="ed-small">A real situation can have more context. These exercises teach verification habits, not guaranteed scam detection.</p>
      </section>
    </div>
  </>
}

export default function AppEdition() {
  const [route, setRoute] = useState(readRoute)
  const [progress, setProgress] = useState(loadProgress)
  const [storageError, setStorageError] = useState(false)
  const mainRef = useRef(null)
  useEffect(() => {
    const onHashChange = () => { setRoute(readRoute()); mainRef.current?.focus() }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  useEffect(() => {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ schema: 1, ...progress })); setStorageError(false) }
    catch { setStorageError(true) }
  }, [progress])
  const go = (next) => {
    window.location.hash = next
    setRoute(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
    requestAnimationFrame(() => mainRef.current?.focus())
  }
  return <div className="edition-shell">
    <a className="ed-skip" href="#edition-main" onClick={(event) => { event.preventDefault(); mainRef.current?.focus() }}>Skip to content</a>
    <header className="ed-header"><button className="ed-brand" onClick={() => go('home')} aria-label="SCAM-A-LAX overview"><span className="ed-brand-mark"><Icon name="shield" size={26} /></span><span><strong>SCAM-A-LAX<span className="ed-brand-period">.</span></strong><small>Protect people. Preserve the story.</small></span></button><span className="ed-header-note">Free. Local. People first.</span></header>
    <nav className="ed-nav" aria-label="Main navigation">{routes.map(([id, title]) => <button key={id} className={route === id ? 'is-active' : ''} aria-current={route === id ? 'page' : undefined} onClick={() => go(id)}>{title}</button>)}</nav>
    <main id="edition-main" ref={mainRef} tabIndex={-1} className={`edition-main ${route === 'cases' ? 'ed-workspace' : ''}`}>
      {storageError && <div className="ed-storage-error" role="status">Practice and checklist progress cannot be saved in this browser. You can keep using these tools, but that progress may be lost when you leave.</div>}
      {route === 'home' && <Overview go={go} completed={Object.keys(progress.answers).length} />}
      {route === 'guide' && <StartHere go={go} />}
      {route === 'check' && <MessageCheck go={go} />}
      {route === 'numbers' && <Suspense fallback={<p className="ed-loading" role="status">Opening your local number tracker…</p>}><NumberTracker go={go} /></Suspense>}
      {route === 'help' && <GetHelp progress={progress} update={setProgress} go={go} />}
      {route === 'academy' && <Academy progress={progress} update={setProgress} />}
      {route === 'cases' && <><div className="ed-workspace-intro"><span className="ed-eyebrow">YOUR EVIDENCE WORKSPACE</span><h1>Keep the details together.</h1><p>A case is your folder. Save the story inside it as a record. Existing cases stay in this browser.</p><details className="ed-case-directions"><summary>How to save your first record</summary><ol aria-label="Quick case directions"><li>Enter a <strong>Case title</strong> and select <strong>+ New case</strong>, or open a case you already made.</li><li>Open <strong>Scam Ledger</strong>. Choose <strong>Kind → note</strong> for your story, or <strong>message</strong> for a message you received.</li><li>Fill in <strong>Message or what happened</strong> and select <strong>Save record</strong>. Check that your words appear in the saved records list.</li><li>Select <strong>Backup workspace</strong> to download a copy of your saved cases.</li></ol></details></div><Suspense fallback={<p className="ed-loading" role="status">Opening your local workspace…</p>}><Workstation /></Suspense></>}
    </main>
    <footer className="ed-footer"><div><strong>SCAM-A-LAX · Larrina’s Edition</strong><span>{VERSION} · Built on Mikey’s open-source foundation.</span></div><p>Local storage is not encrypted. On a shared device, others may be able to read saved cases. Download a backup before clearing browser data.</p><div className="ed-footer-links"><a href="https://consumer.ftc.gov/articles/how-avoid-scam" target="_blank" rel="noopener noreferrer">FTC scam-awareness guide ↗</a><a href="https://github.com/larrinamsalva/SCAM-A-LAX" target="_blank" rel="noopener noreferrer">Source code ↗</a></div></footer>
    <HelpAgent route={route} go={go} />
  </div>
}
