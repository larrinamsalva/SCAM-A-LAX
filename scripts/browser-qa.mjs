import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { academyChoices, lessons } from '../src/academy.js'

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:4175/SCAM-A-LAX/'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const origin = new URL(base).origin
const results = []
let server
let browser

async function visible(locator) {
  await locator.waitFor({ state: 'visible' })
}

async function settle(page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(50)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Page has horizontal overflow')
}

try {
  if (!process.env.QA_BASE_URL) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { stdio: 'ignore' })
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Preview exited with ${server.exitCode}`)
      try { ready = (await fetch(base)).ok } catch { /* server still starting */ }
      if (ready) break
      await delay(100)
    }
    assert.ok(ready, 'Production preview did not start')
  }
  await mkdir('test-results', { recursive: true })
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })

  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, ...(name === 'mobile' ? { isMobile: true, hasTouch: true } : {}) })
    const page = await context.newPage()
    const errors = []
    const outsideRequests = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('request', (request) => { if (new URL(request.url()).origin !== origin) outsideRequests.push(request.url()) })

    await page.goto(base)
    await visible(page.getByRole('heading', { name: /A little pause/ }))
    await settle(page)
    await page.screenshot({ path: `test-results/${name}-overview.png`, fullPage: true })

    // Seed a synthetic v0.6 case and prove the new entry points preserve it.
    const legacyCase = {
      id: 'case-qa', title: 'Synthetic QA case', victimAlias: 'Fictional helper', type: 'Training', status: 'OPEN',
      createdAt: '2026-01-01T00:00:00.000Z', notes: 'Original note', analystLinks: [],
      timeline: [{ id: 'event-qa', at: '2026-01-01T00:00:00.000Z', text: 'Case created.' }],
      evidence: [{ id: 'ev-qa', kind: 'message', state: 'OBSERVED', value: 'Contact training@example.invalid', note: 'Synthetic source', sha256: 'a'.repeat(64), recordedAt: '2026-01-01T00:00:00.000Z' }],
    }
    await page.evaluate((item) => localStorage.setItem('scamalax.state.v1', JSON.stringify({ cases: [item], activeCaseId: item.id })), legacyCase)

    await page.getByRole('button', { name: 'Check a message', exact: true }).first().click()
    await page.getByLabel('Message, email, or call notes').fill('Buy gift cards right now. Don’t tell anyone. https://example.invalid/secret')
    await page.getByRole('button', { name: 'Check this message', exact: true }).click()
    await visible(page.getByRole('heading', { name: '3 warning signs to review' }))
    await visible(page.getByRole('heading', { name: 'Secrecy or isolation request', exact: true }))
    const savedAfterCheck = await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))
    assert.deepEqual(savedAfterCheck.cases[0], legacyCase)
    assert.ok(!(await page.evaluate(() => Object.values(localStorage).join(' '))).includes('example.invalid/secret'), 'Message text was persisted')
    await page.getByLabel('Message, email, or call notes').fill('See you tomorrow.')
    assert.equal(await page.getByRole('heading', { name: '3 warning signs to review' }).count(), 0, 'Edited input retained a stale result')
    await page.getByRole('button', { name: 'Check this message', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'No known patterns matched. Safety is still unverified.' }))
    await settle(page)
    await page.screenshot({ path: `test-results/${name}-check.png`, fullPage: true })
    await page.reload()
    assert.equal(await page.getByLabel('Message, email, or call notes').inputValue(), '', 'Message survived a reload')

    await page.getByRole('button', { name: 'Get help', exact: true }).click()
    await page.getByRole('checkbox', { name: /I sent money/ }).check()
    await page.getByRole('checkbox', { name: /I shared account information/ }).check()
    await page.getByRole('checkbox', { name: /I gave someone device access/ }).check()
    await visible(page.getByText('Contact the payment provider promptly', { exact: false }))
    await page.getByRole('checkbox', { name: /1. Stop the conversation/ }).check()
    await settle(page)
    await page.reload()
    assert.equal(await page.getByRole('checkbox', { name: /I sent money/ }).isChecked(), true)
    assert.equal(await page.getByRole('checkbox', { name: /1. Stop the conversation/ }).isChecked(), true)
    await settle(page)
    await page.screenshot({ path: `test-results/${name}-help.png`, fullPage: true })

    await page.getByRole('button', { name: 'Scam Academy', exact: true }).click()
    for (const lesson of lessons) {
      await page.getByRole('button', { name: new RegExp(lesson.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
      const choice = academyChoices.find((item) => item.id === lesson.answer)
      await page.getByRole('button', { name: choice.label, exact: true }).click()
      await visible(page.getByText('That’s the next step we recommend.', { exact: true }))
    }
    await page.reload()
    assert.equal(await page.getByRole('progressbar', { name: 'Scam Academy progress' }).getAttribute('value'), '20')
    await page.getByLabel('Topic').selectOption('Money & shopping')
    assert.equal(await page.getByRole('navigation', { name: 'Practice scenarios' }).getByRole('button').count(), 5)
    await settle(page)
    await page.screenshot({ path: `test-results/${name}-academy.png`, fullPage: true })

    await page.getByRole('button', { name: 'My cases', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'Synthetic QA case', exact: true }))
    assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))).cases[0], legacyCase)
    await page.getByRole('button', { name: 'Case Packet', exact: true }).click()
    await page.getByPlaceholder('Context, actions taken, handoff notes, unresolved questions…').fill('Original note plus QA update')
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
    await page.getByRole('button', { name: 'My cases', exact: true }).click()
    await page.getByRole('button', { name: 'Case Packet', exact: true }).click()
    assert.equal(await page.getByPlaceholder('Context, actions taken, handoff notes, unresolved questions…').inputValue(), 'Original note plus QA update')
    const packetDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download JSON archive', exact: true }).click()
    const packetFile = await packetDownload
    const packet = JSON.parse(await readFile(await packetFile.path(), 'utf8'))
    assert.equal(packet.case.id, legacyCase.id)
    assert.equal(packet.derivedIntelligence.authority, 'NON_AUTHORITATIVE')

    await page.getByRole('button', { name: 'Open Evidence Intake', exact: true }).click()
    await page.getByLabel('Target case').selectOption(legacyCase.id)
    await page.getByLabel('Paste source text').fill('Training note without private data.')
    await page.getByRole('button', { name: 'Build preview', exact: true }).click()
    await visible(page.getByRole('heading', { name: '1 proposed records' }))
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))).cases[0].evidence.length, 1, 'Preview committed evidence prematurely')
    await page.getByRole('button', { name: 'Hash + commit selected evidence', exact: true }).click()
    await visible(page.getByText('1 evidence record committed. Original file bytes were not stored.', { exact: true }))
    const handoffDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download JSON handoff', exact: true }).click()
    const handoffFile = await handoffDownload
    const handoff = JSON.parse(await readFile(await handoffFile.path(), 'utf8'))
    assert.equal(handoff.evidence.length, 2)
    assert.equal(handoff.derivedIntelligence.authority, 'NON_AUTHORITATIVE')
    await page.getByRole('button', { name: 'Return to workstation', exact: true }).click()
    await visible(page.getByRole('heading', { name: '2 evidence records', exact: true }))
    await settle(page)
    await page.screenshot({ path: `test-results/${name}-cases.png`, fullPage: true })

    await page.getByRole('button', { name: 'ScamCheck', exact: true }).click()
    await page.getByLabel('Case message to check').fill('Buy gift cards right now.')
    await page.getByRole('button', { name: 'Analyze locally', exact: true }).click()
    await page.getByRole('button', { name: 'Record as INFERRED', exact: true }).click()
    await visible(page.getByText('Analysis recorded as INFERRED, not proof.', { exact: true }))
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))
    assert.equal(stored.cases[0].evidence[0].state, 'INFERRED')
    assert.equal(stored.cases[0].evidence.find((item) => item.id === 'ev-qa').state, 'OBSERVED')
    await page.getByLabel('Case title', { exact: true }).fill('Second synthetic QA case')
    await page.getByRole('button', { name: '+ New case', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'Second synthetic QA case', exact: true }))
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))).cases.length, 2)
    assert.deepEqual(errors, [], `${name} browser errors`)
    assert.deepEqual(outsideRequests, [], `${name} unexpectedly transmitted data outside the app origin`)
    results.push({ viewport: name, status: 'passed', stories: ['home', 'message-check privacy and invalidation', 'help persistence', '20 academy scenarios and persistence', 'legacy case preservation', 'case export', 'preview-before-commit intake and handoff', 'inferred-only scan recording'], browserErrors: errors.length, externalRequests: outsideRequests.length })
    await context.close()
  }

  const blockedContext = await browser.newContext()
  await blockedContext.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage unavailable', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Storage unavailable', 'SecurityError') }
  })
  const blockedPage = await blockedContext.newPage()
  const blockedErrors = []
  blockedPage.on('pageerror', (error) => blockedErrors.push(error.message))
  await blockedPage.goto(base)
  await visible(blockedPage.getByText(/Practice and checklist progress cannot be saved/))
  await blockedPage.getByRole('button', { name: 'Scam Academy', exact: true }).click()
  await blockedPage.getByRole('button', { name: academyChoices[0].label, exact: true }).click()
  await visible(blockedPage.getByText('That’s the next step we recommend.', { exact: true }))
  assert.deepEqual(blockedErrors, [])
  results.push({ story: 'blocked learning storage degrades to in-memory progress', status: 'passed' })
  await blockedContext.close()
  console.log(JSON.stringify({ results }, null, 2))
} finally {
  await browser?.close()
  server?.kill('SIGTERM')
}
