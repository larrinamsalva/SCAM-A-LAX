import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeMessage } from '../src/scamcheck.js'
import { radarReading } from '../src/radar.js'

test('radar follows every existing scoring boundary without presenting a probability', () => {
  for (const [score, label] of [[14, 'Low concern'], [19, 'Low concern'], [20, 'Caution'], [44, 'Caution'], [45, 'High concern'], [69, 'High concern'], [70, 'Very high concern'], [100, 'Very high concern']]) {
    const reading = radarReading({ score, findings: [{ id: 'test' }] })
    assert.equal(reading.label, label)
    assert.equal(reading.score, score)
  }
})

test('no matches and missing results remain unknown instead of safe or low risk', () => {
  for (const result of [null, analyzeMessage('See you tomorrow.'), { score: NaN, findings: [{ id: 'test' }] }]) {
    const reading = radarReading(result)
    assert.equal(reading.id, 'UNKNOWN')
    assert.equal(reading.score, null)
    assert.match(reading.label, /safety unverified/)
  }
})

test('radar shows repeatable warning strength, caps totals, and counts each rule once', () => {
  const message = 'Send gift cards right now. Do not tell anyone. Read me your verification code.'
  assert.equal(radarReading(analyzeMessage(message)).score, 90)
  assert.equal(radarReading(analyzeMessage(message.repeat(5))).score, 90)
  const strong = analyzeMessage(message + ' Open AnyDesk and withdraw cash at a bitcoin ATM.')
  assert.equal(radarReading(strong).score, 100)
  assert.equal(radarReading(strong).id, 'CRITICAL')
})
