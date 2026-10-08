import test from 'node:test'
import assert from 'node:assert/strict'
import { isScreenshotFile, screenshotIds, screenshotType, screenshotError } from '../src/screenshots.js'

test('screenshots require recognized image bytes, not a filename or claimed MIME type', () => {
  assert.equal(screenshotType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer), 'image/png')
  assert.equal(screenshotType(Uint8Array.from([255, 216, 255]).buffer), 'image/jpeg')
  assert.equal(screenshotType(new TextEncoder().encode('RIFFxxxxWEBP').buffer), 'image/webp')
  assert.equal(screenshotType(new TextEncoder().encode('<svg><script>bad()</script></svg>').buffer), null)
  assert.equal(screenshotType(new ArrayBuffer(0)), null)
  assert.equal(isScreenshotFile({ name: 'photo.JPG', type: '' }), true)
  assert.equal(isScreenshotFile({ name: 'photo.svg', type: 'image/svg+xml' }), false)
})

test('backup attachment selection includes only referenced images, once, without changing records', () => {
  const cases = [{ evidence: [{ screenshot: { id: 'image-a' }, state: 'OBSERVED' }, { screenshot: { id: 'image-a' }, state: 'INFERRED' }, { fileName: 'old-image.png', sha256: 'receipt-only' }] }, { evidence: [{ screenshot: { id: 'image-b' } }] }]
  const original = structuredClone(cases)
  assert.deepEqual(screenshotIds(cases), ['image-a', 'image-b'])
  assert.deepEqual(cases, original)
})

test('failed screenshot writes clearly report that the image and record were not saved', () => {
  assert.match(screenshotError({ name: 'QuotaExceededError' }), /storage is full.*were not saved/)
  assert.match(screenshotError({ name: 'SecurityError' }), /storage is unavailable.*were not saved/)
})
