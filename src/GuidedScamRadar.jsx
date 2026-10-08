import { useState } from 'react'
import { GUIDED_QUESTIONS, scoreGuidedAnswers } from './guided-radar.js'
import './guided-radar.css'

const BANDS = [
  { min: 0, max: 19, color: '#208056' },
  { min: 20, max: 44, color: '#b28320' },
  { min: 45, max: 69, color: '#c25e22' },
  { min: 70, max: 100, color: '#b32840' },
]

function arc(from, to) {
  const point = (value) => {
    const angle = (180 - value * 1.8) * Math.PI / 180
    return [150 + 116 * Math.cos(angle), 135 - 116 * Math.sin(angle)]
  }
  const start = point(from)
  const end = point(to)
  return 'M ' + start.join(' ') + ' A 116 116 0 0 1 ' + end.join(' ')
}

function displayMessage(result) {
  if (!result.warnings.length) return 'No warning signs selected yet. That does not mean this situation is safe.'
  if (result.score >= 70) return 'Several serious warning signs were selected. Stop before sending money, codes, or information. Check with a trusted person or institution.'
  if (result.score >= 45) return 'These warning signs deserve attention. Pause and check the story using a contact you already trust.'
  return 'There is at least one reason to pause. A low score does not confirm a call, message, or person is safe.'
}

export default function GuidedScamRadar({ go }) {
  const [answers, setAnswers] = useState({})
  const [index, setIndex] = useState(0)
  const question = GUIDED_QUESTIONS[index]
  const answer = answers[question.id]
  const result = scoreGuidedAnswers(answers)
  const chosenColor = result.score === 0 ? '#667489' : BANDS.find((band) => result.score <= band.max).color

  const respond = (value) => {
    setAnswers((current) => {
      const next = { ...current }
      if (next[question.id] === value) delete next[question.id]
      else next[question.id] = value
      return next
    })
  }

  const restart = () => {
    setAnswers({})
    setIndex(0)
  }

  return <div className="ed-narrow easy-radar-page">
    <div className="ed-page-title">
      <span className="ed-eyebrow">EASY SCAM RADAR · NO ACCOUNT NEEDED</span>
      <h1>Let's check what happened.</h1>
      <p>Answer one simple question at a time. Watch the needle move when you select a warning sign. You can do this for yourself or help someone you care about.</p>
    </div>
    <div className="easy-layout">
      <section className="easy-card easy-questions" aria-labelledby="easy-question-title">
        <div className="easy-step"><span>Question {index + 1} of {GUIDED_QUESTIONS.length}</span><span>{result.answered} answered</span></div>
        <progress value={result.answered} max={GUIDED_QUESTIONS.length} aria-label="Questions answered" />
        <p className="easy-topic">{question.topic}</p>
        <h2 id="easy-question-title">{question.question}</h2>
        <p className="easy-hint">{question.hint}</p>
        <div className="easy-responses" role="group" aria-label="Choose your answer">
          {[
            { value: 'yes', title: 'YES', help: 'This happened' },
            { value: 'no', title: 'NO', help: 'This did not happen' },
            { value: 'unsure', title: 'NOT SURE', help: 'I am not sure' },
          ].map((option) =>
            <button
              type="button"
              key={option.value}
              className={'easy-response' + (answer === option.value ? ' easy-selected' : '')}
              aria-pressed={answer === option.value}
              onClick={() => respond(option.value)}
            >
              <strong>{option.title}</strong><span>{option.help}</span>
            </button>,
          )}
        </div>
        {answer === 'yes' && <div className="easy-explanation" role="status">
          <strong>+{question.points} warning points</strong>
          <p>{question.reason}</p>
        </div>}
        {answer === 'unsure' && <div className="easy-explanation" role="status">
          <strong>Not sure? That's okay.</strong>
          <p>No points added. It's still worth checking with someone you trust.</p>
        </div>}
        <div className="easy-controls">
          <button type="button" className="easy-small-button" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>← Previous</button>
          <button type="button" className="easy-next" onClick={() => {
            if (index < GUIDED_QUESTIONS.length - 1) setIndex((i) => i + 1)
            else document.getElementById('easy-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}>{index === GUIDED_QUESTIONS.length - 1 ? 'Review answers ↓' : 'Next question →'}</button>
        </div>
        <button type="button" className="easy-reset" onClick={restart}>Start over and clear answers</button>
      </section>

      <aside className="easy-card easy-meter" aria-labelledby="easy-meter-title">
        <p className="easy-meter-eyebrow">LIVE WARNING METER</p>
        <h2 id="easy-meter-title">Your Scam Radar</h2>
        <div
          className="easy-gauge"
          role={result.score ? 'meter' : 'status'}
          aria-label={result.score ? 'Scam warning strength' : 'Unknown — safety unverified'}
          aria-valuemin={result.score ? 0 : undefined}
          aria-valuemax={result.score ? 100 : undefined}
          aria-valuenow={result.score || undefined}
          aria-valuetext={result.score ? result.label + ', ' + result.score + ' of 100 warning points' : undefined}
        >
          <svg viewBox="0 0 300 168" aria-hidden="true">
            {BANDS.map((band) => <path key={band.min} d={arc(band.min, band.max)} fill="none" stroke={band.color} strokeWidth="19" strokeLinecap="butt" />)}
            <path d="M 150 133 L 146 47 Q 150 35 154 47 Z" fill={chosenColor} transform={'rotate(' + (result.score === 0 ? -90 : result.score * 1.8 - 90) + ' 150 135)'} className="easy-needle" />
            <circle cx="150" cy="135" r="10" fill={chosenColor} />
          </svg>
          <div className="easy-ends" aria-hidden="true"><span>Lower</span><span>Higher</span></div>
        </div>
        <div className="easy-meter-status" aria-live="polite" aria-atomic="true">
          <strong style={{ color: chosenColor }}>{result.label}</strong>
          <span>{result.score ? result.score + ' / 100 warning points' : 'No warning points selected'}</span>
        </div>
        <p className="easy-meter-advice">{displayMessage(result)}</p>
        <p className="easy-caution"><strong>Important:</strong> This is a count of selected warning signs, not a percentage chance of a scam. Even one serious request could be dangerous. Saying NO does not prove safety.</p>
        <p className="easy-private">Your answers stay on this page. They are not saved, sent online, or added to your cases.</p>
      </aside>
    </div>

    <section id="easy-summary" className="easy-card easy-review" aria-labelledby="easy-review-title">
      <h2 id="easy-review-title">What should I do next?</h2>
      <p>{result.warnings.length ? 'These are the warning signs you selected:' : 'If something still feels wrong, take time to verify it even without a meter warning.'}</p>
      {result.warnings.length > 0 && <ul className="easy-finding-list">{result.warnings.map((item) => <li key={item.id}><strong>{item.question}</strong><span>{item.reason}</span></li>)}</ul>}
      {result.unsure > 0 && <p className="easy-unsure">{result.unsure} answer{result.unsure === 1 ? '' : 's'} marked NOT SURE. An unanswered or uncertain question is not proof that a situation is safe.</p>}
      <div className="easy-actions">
        <button type="button" className="easy-next" onClick={() => go('help')}>I need help now</button>
        <button type="button" className="easy-small-button" onClick={() => go('cases')}>Save my story in a case</button>
      </div>
      <p className="easy-resource-heading">Trusted information:</p>
      <div className="easy-resource-links">
        <a href="https://consumer.ftc.gov/articles/what-do-if-you-were-scammed" target="_blank" rel="noopener noreferrer">FTC: What to do if you were scammed ↗</a>
        <a href="https://consumer.ftc.gov/articles/refund-and-recovery-scams" target="_blank" rel="noopener noreferrer">FTC: Refund scams ↗</a>
        <a href="https://consumer.ftc.gov/articles/how-avoid-scam" target="_blank" rel="noopener noreferrer">FTC: How to avoid scams ↗</a>
      </div>
    </section>
  </div>
}
