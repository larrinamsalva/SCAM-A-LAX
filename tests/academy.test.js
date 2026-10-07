import test from 'node:test'
import assert from 'node:assert/strict'
import { academyChoices, getSupportSteps, lessons, officialResources } from '../src/academy.js'

test('twenty distinct scenarios cover four topics and include expected activity', () => {
  assert.equal(lessons.length, 20)
  assert.equal(new Set(lessons.map((lesson) => lesson.id)).size, 20)
  assert.equal(new Set(lessons.map((lesson) => lesson.category)).size, 4)
  assert.ok(lessons.filter((lesson) => lesson.answer === 'expected').length >= 3)
  for (const lesson of lessons) {
    assert.ok(academyChoices.some((choice) => choice.id === lesson.answer))
    assert.ok(lesson.message.length > 40 && lesson.why.length > 40)
    assert.doesNotMatch(lesson.message, /https?:\/\//)
  }
})

test('support steps adapt to each exposure without dropping general guidance', () => {
  const general = getSupportSteps().map((step) => step.id)
  assert.deepEqual(general, ['pause', 'evidence', 'report', 'recovery'])
  assert.deepEqual(getSupportSteps(['money']).map((step) => step.id), ['pause', 'provider', 'evidence', 'report', 'recovery'])
  const all = getSupportSteps(['money', 'account', 'device']).map((step) => step.id)
  assert.equal(new Set(all).size, all.length)
  assert.ok(all.indexOf('device') < all.indexOf('account'))
  assert.match(getSupportSteps(['money'])[1].detail, /not guaranteed/)
  assert.deepEqual(getSupportSteps(['unknown']), getSupportSteps())
})

test('reporting resources use official HTTPS government hosts', () => {
  for (const resource of officialResources) {
    const url = new URL(resource.href)
    assert.equal(url.protocol, 'https:')
    assert.ok(url.hostname.endsWith('.ftc.gov') || url.hostname === 'www.identitytheft.gov')
  }
})
