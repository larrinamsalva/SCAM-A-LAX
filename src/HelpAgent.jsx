import { useEffect, useRef, useState } from 'react'
import { answerHelpQuestion, getHelpTopic, getPageHelp, helpQuickTopics, HELP_QUESTION_LIMIT } from './help-agent.js'
import './help-agent.css'

const greeting = { id: 0, reply: { title: 'A little help, one step at a time.', text: 'Choose a topic below, or ask a question about using the app.', steps: [], actions: [] } }

export default function HelpAgent({ route, go }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([greeting])
  const sequence = useRef(0)
  const launcher = useRef(null)
  const heading = useRef(null)
  const conversation = useRef(null)

  const close = () => {
    setOpen(false)
    launcher.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!open) return
    heading.current?.focus({ preventScroll: true })
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        launcher.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    const chat = conversation.current
    if (open && chat?.lastElementChild) {
      chat.scrollTop = chat.lastElementChild.offsetTop
      chat.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [messages, open])

  const ask = (text, reply = answerHelpQuestion(text, route)) => {
    const trimmed = text.trim()
    if (!trimmed || trimmed.length > HELP_QUESTION_LIMIT) return
    const userId = ++sequence.current
    const replyId = ++sequence.current
    setMessages((current) => [...current, { id: userId, question: trimmed }, { id: replyId, reply }].slice(-12))
    setQuestion('')
  }

  return <>
    <button ref={launcher} type="button" className="ed-helper-launcher" aria-label={open ? 'Close help agent' : 'Open help agent'} aria-expanded={open} aria-controls="app-help-agent" onClick={() => open ? close() : setOpen(true)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16v13H9l-5 4Z" /><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4" /><path d="M12 15h.01" /></svg>
      App helper
    </button>
    {open && <section id="app-help-agent" className="ed-helper-panel" role="dialog" aria-modal="false" aria-labelledby="app-helper-title" aria-describedby="app-helper-description">
      <header className="ed-helper-header"><div><span className="ed-eyebrow">HERE TO HELP</span><h2 id="app-helper-title" ref={heading} tabIndex={-1}>Your app helper</h2></div><button type="button" className="ed-helper-close" aria-label="Close helper panel" onClick={close}>×</button></header>
      <p id="app-helper-description" className="ed-helper-description">Built-in app directions. Questions stay in this tab and clear on refresh. Use Save record to keep your story.</p>
      <ol ref={conversation} className="ed-helper-chat" role="log" aria-label="Helper conversation" aria-live="polite" aria-relevant="additions">
        {messages.map((message) => <li key={message.id} className={message.question ? 'ed-helper-question' : 'ed-helper-answer'}>
          {message.question ? <><span className="ed-helper-speaker">YOU</span><p>{message.question}</p></> : <><span className="ed-helper-speaker">APP HELPER</span><h3>{message.reply.title}</h3><p>{message.reply.text}</p>{message.reply.steps.length > 0 && <ol>{message.reply.steps.map((step) => <li key={step}>{step}</li>)}</ol>}<div className="ed-helper-actions">{message.reply.actions.map((action) => <button key={action.route} type="button" onClick={() => { setOpen(false); go(action.route) }}>{action.label} <span aria-hidden="true">→</span></button>)}</div></>}
        </li>)}
      </ol>
      <div className="ed-helper-topics" aria-label="Quick help topics">{helpQuickTopics.map((topic) => <button key={topic.id} type="button" onClick={() => ask(topic.label, getHelpTopic(topic.id))}>{topic.label}</button>)}<button type="button" onClick={() => ask('Help on this page', getPageHelp(route))}>Help on this page</button></div>
      <form className="ed-helper-form" onSubmit={(event) => { event.preventDefault(); ask(question) }}>
        <label htmlFor="app-helper-question">What do you need help with?</label>
        <div><input id="app-helper-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={HELP_QUESTION_LIMIT} placeholder="For example: no record found" autoComplete="off" aria-describedby="app-helper-input-note" /><button type="submit" disabled={!question.trim()}>Ask</button></div>
        <small id="app-helper-input-note">Ask about the buttons and steps. Leave out passwords and account numbers.</small>
      </form>
    </section>}
  </>
}
