import test from 'node:test'
import assert from 'node:assert/strict'
import { GUIDED_QUESTIONS, scoreGuidedAnswers } from '../src/guided-radar.js'

test('question IDs are unique and all questions contain useful help', () => {
  assert.equal(new Set(GUIDED_QUESTIONS.map((q) => q.id)).size, GUIDED_QUESTIONS.length)
  assert.ok(GUIDED_QUESTIONS.every((q) => q.question && q.hint && q.reason && q.points > 0))
})

test('unanswered, no and unsure answers never receive a safe verdict', () => {
  const initial = scoreGuidedAnswers()
  assert.equal(initial.score, 0)
  assert.equal(initial.level, 'UNKNOWN')
  assert.match(initial.label, /safety unverified/i)
  const checked = scoreGuidedAnswers({ 'gift-payment': 'no', 'gift-cover': 'unsure' })
  assert.equal(checked.answered, 2)
  assert.equal(checked.unsure, 1)
  assert.equal(checked.score, 0)
  assert.equal(checked.level, 'UNKNOWN')
})

test('yes answers move the score forward and deselecting moves it backward', () => {
  const first = scoreGuidedAnswers({ 'gift-payment': 'yes' })
  const second = scoreGuidedAnswers({ 'gift-payment': 'yes', 'gift-cover': 'yes' })
  const removed = scoreGuidedAnswers({ 'gift-payment': 'no', 'gift-cover': 'yes' })
  assert.equal(first.score, 28)
  assert.equal(second.score, 54)
  assert.equal(removed.score, 26)
  assert.equal(second.level, 'HIGH')
  assert.equal(removed.level, 'ELEVATED')
})

test('multiple serious signals reach red without exceeding 100', () => {
  const chosen = Object.fromEntries(GUIDED_QUESTIONS.map((q) => [q.id, 'yes']))
  const result = scoreGuidedAnswers(chosen)
  assert.equal(result.score, 100)
  assert.equal(result.level, 'CRITICAL')
  assert.equal(result.warnings.length, GUIDED_QUESTIONS.length)
})

test('unsupported answers and unknown IDs do not raise score', () => {
  const result = scoreGuidedAnswers({ 'gift-payment': 'perhaps', random: 'yes', 'refund-overpay': 'yes' })
  assert.equal(result.score, 32)
  assert.equal(result.answered, 1)
  assert.equal(result.warnings[0].id, 'refund-overpay')
})

test('phone-pressure answers cover callback context and progress across all warning bands', () => {
  assert.equal(GUIDED_QUESTIONS.length, 24)
  const low = { 'quick-callback': 'yes' }
  const elevated = { ...low, 'stay-on-line': 'yes' }
  const high = { ...elevated, 'bank-cover': 'yes' }
  const critical = { ...high, 'block-verification': 'yes' }
  for (const [answers, score, level] of [[low, 6, 'LOW'], [elevated, 22, 'ELEVATED'], [high, 46, 'HIGH'], [critical, 70, 'CRITICAL']]) {
    assert.equal(scoreGuidedAnswers(answers).score, score)
    assert.equal(scoreGuidedAnswers(answers).level, level)
  }
  assert.match(GUIDED_QUESTIONS.find((q) => q.id === 'quick-callback').reason, /alone can be ordinary/)
  assert.match(GUIDED_QUESTIONS.find((q) => q.id === 'stay-on-line').hint, /register/)
})

test('language, accent, nationality, and contact-log fields never contribute warning points', () => {
  const result = scoreGuidedAnswers({ language: 'Hindi', accent: 'Indian', nationality: 'India', keptOnPhone: 'yes', quickCallback: 'yes' })
  assert.equal(result.score, 0)
  assert.equal(result.answered, 0)
  assert.equal(result.level, 'UNKNOWN')
})
