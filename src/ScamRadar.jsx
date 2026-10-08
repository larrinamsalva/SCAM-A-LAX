import { useId } from 'react'
import { RADAR_LEVELS, radarReading } from './radar.js'
import './radar.css'

function arc(from, to) {
  const point = (value) => {
    const angle = (180 - value * 1.8) * Math.PI / 180
    return [150 + 116 * Math.cos(angle), 135 - 116 * Math.sin(angle)]
  }
  const start = point(from)
  const end = point(to)
  return `M ${start.join(' ')} A 116 116 0 0 1 ${end.join(' ')}`
}

export default function ScamRadar({ result }) {
  const reading = radarReading(result)
  const noteId = useId()
  return <section className="scam-radar" aria-label="Scam radar">
    <div className="radar-visual" {...(reading.score === null ? { role: 'status', 'aria-label': reading.label } : { role: 'meter', 'aria-label': 'Scam radar warning strength', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': reading.score, 'aria-valuetext': `${reading.label}, ${reading.score} of 100 warning points` })} aria-describedby={noteId}>
      <svg viewBox="0 0 300 165" aria-hidden="true">
        {RADAR_LEVELS.map((level, index) => <path key={level.id} d={arc(index ? level.min + .5 : 0, level.max)} fill="none" stroke={reading.score === null ? '#c9ced3' : level.color} strokeWidth="18" />)}
        <path d="M 150 131 L 145 44 Q 150 33 155 44 Z" fill={reading.color} transform={`rotate(${reading.score === null ? 0 : reading.score * 1.8 - 90} 150 135)`} opacity={reading.score === null ? .35 : 1} />
        <circle cx="150" cy="135" r="10" fill={reading.color} />
      </svg>
      <div className="radar-endpoints" aria-hidden="true"><span>Low</span><span>Very high</span></div>
    </div>
    <div className="radar-copy"><span className="radar-eyebrow">SCAM RADAR</span><h3 style={{ color: reading.color }}>{reading.label}</h3>{reading.score !== null && <p className="radar-points"><strong>{reading.score}</strong> / 100 warning points</p>}<p>{reading.next}</p><p id={noteId} className="radar-note">Warning strength, not the chance of a scam or the amount of harm. Even one request can be serious. Low or unknown does not mean safe.</p></div>
    <details className="radar-explanation"><summary>How to read this meter</summary><p>Each matched text rule adds warning points once. The same phrase repeated does not add more points. This check does not verify people, phone numbers, websites, or images.</p><ul className="radar-levels">{RADAR_LEVELS.map((level) => <li key={level.id}><i style={{ background: level.color }} aria-hidden="true" /><strong>{level.label}</strong><span>{level.min}–{level.max} points</span></li>)}</ul>{result.findings.length > 0 && <ul className="radar-rule-points">{result.findings.map((finding) => <li key={finding.id}><span>{finding.label}</span><strong>+{finding.weight}</strong></li>)}</ul>}<p>Totals stop at 100. Read the explanations below to decide your next step.</p></details>
  </section>
}
