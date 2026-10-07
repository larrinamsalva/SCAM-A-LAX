import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeMessage } from '../src/scamcheck.js'

test('explains payment, pressure, and secrecy with source excerpts', () => {
  const result = analyzeMessage('Buy gift cards right now and don’t tell anyone.')
  assert.deepEqual(result.findings.map((finding) => finding.id), ['gift-card', 'pressure', 'secrecy'])
  assert.equal(result.status, 'REVIEW')
  assert.equal(result.findings[2].excerpt, 'don’t tell')
  result.findings.forEach((finding) => {
    assert.ok(finding.why.length > 30)
    assert.ok(finding.action.length > 30)
  })
})

test('no configured match remains undetermined, including missing input', () => {
  for (const text of ['', null, 'See you tomorrow.', 'Our method is to work together.']) {
    const result = analyzeMessage(text)
    assert.equal(result.status, 'UNDETERMINED')
    assert.equal(result.findings.length, 0)
  }
})

test('detects task-deposit and recovery-fee patterns', () => {
  assert.ok(analyzeMessage('Deposit to unlock your earnings.').findings.some((finding) => finding.id === 'job-fee'))
  assert.ok(analyzeMessage('I can recover your money for a recovery fee.').findings.some((finding) => finding.id === 'recovery'))
})

test('does not match short cryptocurrency symbols inside ordinary words', () => {
  assert.equal(analyzeMessage('weather together method birthday').findings.length, 0)
  assert.ok(analyzeMessage('Send ETH to my wallet.').findings.some((finding) => finding.id === 'crypto'))
})

test('a security warning may match a rule without becoming proof', () => {
  const result = analyzeMessage('Never share your verification code.')
  assert.equal(result.status, 'REVIEW')
  assert.equal(result.findings[0].id, 'code')
  assert.match(result.findings[0].why, /legitimately/)
})

test('pasted markup and URL text remain data, with repeatable results', () => {
  const text = '<script>ignored()</script> https://example.invalid/urgent?gift=1'
  assert.deepEqual(analyzeMessage(text), analyzeMessage(text))
  assert.equal(typeof analyzeMessage(text).findings[0].excerpt, 'string')
})
