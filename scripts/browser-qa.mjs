import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { academyChoices, lessons } from '../src/academy.js'

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:4175/SCAM-A-LAX/'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const origin = new URL(base).origin
const results = []
let server
let browser
let imageFixture

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

    await page.getByRole('button', { name: 'Open help agent', exact: true }).click()
    const helper = page.getByRole('dialog', { name: 'Your app helper', exact: true })
    await visible(helper)
    await helper.getByRole('button', { name: 'Find my record', exact: true }).click()
    await visible(helper.getByRole('heading', { name: 'Find or check a saved record', exact: true }))
    assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))).cases[0], legacyCase, 'Helper changed existing case evidence')
    await helper.getByRole('button', { name: 'Go to My cases', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'Synthetic QA case', exact: true }))
    assert.equal(await helper.count(), 0, 'Destination selection should close the helper')

    await page.getByRole('button', { name: 'Start here', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'Your first case, step by step.', exact: true }))
    assert.equal(await page.getByRole('list', { name: 'Case directions', exact: true }).locator(':scope > li').count(), 5)
    assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))).cases[0], legacyCase, 'Reading the guide changed saved evidence')
    await settle(page)
    await page.screenshot({ path: `test-results/${name}-start-here.png`, fullPage: true })
    await page.getByRole('button', { name: 'Open My cases', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'Synthetic QA case', exact: true }))

    await page.getByRole('button', { name: 'Check a message', exact: true }).first().click()
    await page.getByLabel('Message, email, or call notes').fill('Buy gift cards right now. Don’t tell anyone. https://example.invalid/secret')
    await page.getByRole('button', { name: 'Check this message', exact: true }).click()
    await visible(page.getByRole('heading', { name: '3 warning signs to review' }))
    await visible(page.getByRole('meter', { name: 'Scam radar warning strength', exact: true }))
    assert.equal(await page.getByRole('meter', { name: 'Scam radar warning strength', exact: true }).getAttribute('aria-valuenow'), '66')
    await visible(page.getByRole('heading', { name: 'High concern', exact: true }))
    await visible(page.getByRole('heading', { name: 'Secrecy or isolation request', exact: true }))
    const savedAfterCheck = await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))
    assert.deepEqual(savedAfterCheck.cases[0], legacyCase)
    assert.ok(!(await page.evaluate(() => Object.values(localStorage).join(' '))).includes('example.invalid/secret'), 'Message text was persisted')
    await page.getByLabel('Message, email, or call notes').fill('See you tomorrow.')
    assert.equal(await page.getByRole('heading', { name: '3 warning signs to review' }).count(), 0, 'Edited input retained a stale result')
    await page.getByRole('button', { name: 'Check this message', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'No known patterns matched. Safety is still unverified.' }))
    assert.equal(await page.getByRole('meter', { name: 'Scam radar warning strength', exact: true }).count(), 0, 'An unmatched message became a low/safe meter reading')
    await visible(page.getByRole('status', { name: 'Unknown · safety unverified', exact: true }))
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
    await visible(page.getByRole('heading', { name: '2 saved records', exact: true }))
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
    await visible(page.getByRole('heading', { name: '0 saved records', exact: true }))
    await visible(page.getByText('Your case is ready. Add your first record.', { exact: true }))
    await page.getByText('How to save your first record', { exact: true }).click()
    await visible(page.getByRole('list', { name: 'Quick case directions', exact: true }))
    const story = 'Fictional practice report: someone asked me to buy gift cards.'
    await page.getByLabel('Kind', { exact: true }).selectOption('note')
    await page.getByLabel('Message or what happened', { exact: true }).fill(story)
    // Asking for help must preserve this unsaved record and leave case data alone.
    const beforeHelper = await page.evaluate(() => localStorage.getItem('scamalax.state.v1'))
    await page.getByRole('button', { name: 'Open help agent', exact: true }).click()
    await helper.getByRole('button', { name: 'Help on this page', exact: true }).click()
    await visible(helper.getByRole('heading', { name: 'Save your story as a record', exact: true }))
    assert.equal(await helper.getByLabel('What do you need help with?').getAttribute('maxlength'), '400')
    const privateQuestion = 'No record found. Fictional helper question 8fe53.'
    await helper.getByLabel('What do you need help with?').fill(privateQuestion)
    await helper.getByRole('button', { name: 'Ask', exact: true }).click()
    await visible(helper.getByRole('heading', { name: 'Find or check a saved record', exact: true }))
    assert.equal(await helper.getByRole('heading', { name: 'Find or check a saved record', exact: true }).count(), 1)
    assert.equal(await page.evaluate(() => localStorage.getItem('scamalax.state.v1')), beforeHelper, 'Helper wrote to case storage')
    assert.ok(!(await page.evaluate(() => Object.values(localStorage).join(' '))).includes('8fe53'), 'Helper question was persisted')
    await settle(page)
    await page.screenshot({ path: `test-results/${name}-app-helper.png`, fullPage: true })
    await page.keyboard.press('Escape')
    assert.equal(await helper.count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Open help agent', exact: true }).evaluate((button) => button === document.activeElement), true)
    assert.equal(await page.getByLabel('Message or what happened', { exact: true }).inputValue(), story)
    await page.getByRole('button', { name: 'Open help agent', exact: true }).click()
    await helper.getByLabel('What do you need help with?').fill('<img src="https://example.invalid/qa" onerror="alert(1)">')
    await helper.getByRole('button', { name: 'Ask', exact: true }).click()
    assert.equal(await helper.locator('img').count(), 0, 'Helper interpreted question text as HTML')
    await helper.getByRole('button', { name: 'Close helper panel', exact: true }).click()
    // Reading the reminder must not discard the unsaved story.
    await page.getByText('How to save your first record', { exact: true }).click()
    assert.equal(await page.getByLabel('Message or what happened', { exact: true }).inputValue(), story)
    await page.getByRole('button', { name: 'Save record', exact: true }).click()
    await visible(page.getByRole('heading', { name: '1 saved record', exact: true }))
    assert.equal(await page.getByText('Your case is ready. Add your first record.', { exact: true }).count(), 0)
    await page.reload()
    await visible(page.getByRole('heading', { name: '1 saved record', exact: true }))
    const afterSave = await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))
    await page.getByRole('button', { name: 'Open help agent', exact: true }).click()
    assert.equal(await helper.getByText(privateQuestion, { exact: true }).count(), 0, 'Helper conversation survived a reload')
    await helper.getByRole('button', { name: 'Close helper panel', exact: true }).click()
    assert.equal(afterSave.cases[0].evidence[0].value, story)
    assert.equal(afterSave.cases[0].evidence[0].kind, 'note')
    assert.equal(afterSave.cases[0].evidence[0].state, 'OBSERVED')
    assert.match(afterSave.cases[0].evidence[0].sha256, /^[a-f0-9]{64}$/)
    assert.equal(afterSave.cases[1].evidence.find((item) => item.id === 'ev-qa').sha256, legacyCase.evidence[0].sha256)
    const backupDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Backup workspace', exact: true }).click()
    const backupFile = await backupDownload
    const backup = JSON.parse(await readFile(await backupFile.path(), 'utf8'))
    assert.equal(backup.schema, 'scamalax.workspace.v1')
    assert.deepEqual(backup.store, afterSave)
    await settle(page)
    await page.screenshot({ path: `test-results/${name}-first-record.png`, fullPage: true })

    // A real image is saved unchanged, with its manually entered words, and exported.
    const screenshotBytes = await page.screenshot()
    const screenshotFile = { name: 'fictional-message.png', mimeType: 'image/png', buffer: screenshotBytes }
    imageFixture = screenshotFile
    const screenshotWords = 'Fictional transcription: Send gift cards right now. Do not tell anyone. Read me your verification code.'
    await page.getByLabel('Message or what happened', { exact: true }).fill(screenshotWords)
    await page.getByLabel('Screenshot or original file (optional)', { exact: true }).setInputFiles(screenshotFile)
    await visible(page.getByRole('img', { name: 'Selected screenshot preview', exact: true }))
    await page.getByRole('button', { name: 'Save record', exact: true }).click()
    await visible(page.getByRole('heading', { name: '2 saved records', exact: true }))
    await page.reload()
    const savedImage = page.getByRole('img', { name: 'Saved screenshot: fictional-message.png', exact: true })
    await visible(savedImage)
    await savedImage.evaluate((image) => image.decode())
    const withImage = await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))
    const imageRecord = withImage.cases[0].evidence[0]
    assert.equal(imageRecord.value, screenshotWords, 'Attaching an image discarded the written description')
    assert.equal(imageRecord.state, 'OBSERVED')
    assert.equal(imageRecord.sha256, createHash('sha256').update(screenshotBytes).digest('hex'))
    assert.ok(imageRecord.screenshot.id)
    assert.equal(JSON.stringify(withImage).includes('data:image'), false, 'Image bytes were placed in text-only localStorage')
    await page.getByRole('button', { name: 'View screenshot fictional-message.png', exact: true }).click()
    const imageDialog = page.getByRole('dialog', { name: 'fictional-message.png', exact: true })
    await visible(imageDialog)
    assert.equal(await imageDialog.evaluate((dialog) => dialog.matches(':modal')), true)
    await page.keyboard.press('Escape')
    assert.equal(await imageDialog.count(), 0)
    assert.equal(await page.getByRole('button', { name: 'View screenshot fictional-message.png', exact: true }).evaluate((button) => button === document.activeElement), true)
    const originalDownload = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Download original image', exact: true }).click()
    assert.deepEqual(await readFile(await (await originalDownload).path()), screenshotBytes)
    const imageBackupDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Backup workspace', exact: true }).click()
    const imageBackup = JSON.parse(await readFile(await (await imageBackupDownload).path(), 'utf8'))
    assert.deepEqual(imageBackup.store, withImage)
    assert.equal(imageBackup.attachments.length, 1)
    assert.equal(imageBackup.attachments[0].id, imageRecord.screenshot.id)
    assert.equal(imageBackup.attachments[0].dataUrl, 'data:image/png;base64,' + screenshotBytes.toString('base64'))
    await settle(page)
    await page.screenshot({ path: `test-results/${name}-saved-screenshot.png`, fullPage: true })
    await page.locator('.saved-screenshot').screenshot({ path: `test-results/${name}-screenshot-card.png` })
    await page.getByRole('button', { name: 'Case Packet', exact: true }).click()
    const imageArchiveDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download JSON archive', exact: true }).click()
    const imageArchive = JSON.parse(await readFile(await (await imageArchiveDownload).path(), 'utf8'))
    assert.equal(imageArchive.attachments[0].dataUrl, imageBackup.attachments[0].dataUrl)
    await page.getByRole('button', { name: 'Open Evidence Intake', exact: true }).click()
    const imageHandoffDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download JSON handoff', exact: true }).click()
    const imageHandoff = JSON.parse(await readFile(await (await imageHandoffDownload).path(), 'utf8'))
    assert.equal(imageHandoff.attachments[0].dataUrl, imageBackup.attachments[0].dataUrl)
    await page.getByRole('button', { name: 'Return to workstation', exact: true }).click()
    await page.locator('.evidence-card').filter({ hasText: 'fictional-message.png' }).getByRole('button', { name: 'Check record text', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'Very high concern', exact: true }))
    assert.equal(await page.getByRole('meter', { name: 'Scam radar warning strength', exact: true }).getAttribute('aria-valuenow'), '90')
    await page.getByText('How to read this meter', { exact: true }).click()
    await settle(page)
    await page.screenshot({ path: `test-results/${name}-scam-radar.png`, fullPage: true })
    await page.getByRole('region', { name: 'Scam radar', exact: true }).screenshot({ path: `test-results/${name}-radar-meter.png` })
    for (const [text, label, points] of [['Urgent: reply today.', 'Low concern', '14'], ['Gift cards requested.', 'Caution', '28'], [screenshotWords, 'Very high concern', '90']]) {
      await page.getByLabel('Case message to check', { exact: true }).fill(text)
      assert.equal(await page.getByRole('meter', { name: 'Scam radar warning strength', exact: true }).count(), 0, 'Edited text retained a stale radar')
      await page.getByRole('button', { name: 'Analyze locally', exact: true }).click()
      await visible(page.getByRole('heading', { name: label, exact: true }))
      assert.equal(await page.getByRole('meter', { name: 'Scam radar warning strength', exact: true }).getAttribute('aria-valuenow'), points)
    }
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1'))), withImage, 'Radar changed source evidence')

    // A separate fixture exercises phone lookup without changing source evidence.
    const phoneCases = [
      { ...legacyCase, id: 'phone-a', title: 'First phone QA case', evidence: [
        { ...legacyCase.evidence[0], id: 'phone-a1', kind: 'phone', value: '+1 (415) 555-0199', note: 'Fictional caller', sha256: 'b'.repeat(64) },
        { ...legacyCase.evidence[0], id: 'phone-a2', value: 'Same callback: +1 415 555 0199.', state: 'INFERRED', note: 'Fictional interpretation', sha256: 'c'.repeat(64) },
      ] },
      { ...legacyCase, id: 'phone-b', title: 'Second phone QA case', evidence: [
        { ...legacyCase.evidence[0], id: 'phone-b1', kind: 'phone', value: '+1 415 555 0199', sha256: 'd'.repeat(64) },
        { ...legacyCase.evidence[0], id: 'phone-b2', kind: 'phone', value: '(415) 555-0199', sha256: 'e'.repeat(64) },
      ] },
    ]
    const phoneStore = { cases: phoneCases, activeCaseId: 'phone-b' }
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
    await page.evaluate((store) => localStorage.setItem('scamalax.state.v1', JSON.stringify(store)), phoneStore)
    await page.getByRole('button', { name: 'Number tracker', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'Look up a phone number.', exact: true }))
    await page.getByLabel('Phone number', { exact: true }).fill('+1 (415) 555-0199')
    await page.getByRole('button', { name: 'Search saved cases', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'Found in 2 saved cases', exact: true }))
    assert.equal(await page.getByRole('article').count(), 2)
    assert.equal(await page.getByText('INFERRED', { exact: true }).count(), 1)
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1'))), phoneStore, 'Phone lookup changed saved data')
    await settle(page)
    await page.screenshot({ path: `test-results/${name}-number-tracker.png`, fullPage: true })
    await page.getByLabel('Phone number', { exact: true }).fill('+1 212 555 0123')
    assert.equal(await page.getByRole('heading', { name: 'Found in 2 saved cases', exact: true }).count(), 0, 'Edited phone input retained stale matches')
    await page.getByRole('button', { name: 'Search saved cases', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'No match in your saved cases.', exact: true }))
    await visible(page.getByText('This does not tell you whether the number is safe. Public scam reports are not searched.', { exact: true }))
    await page.getByLabel('Phone number', { exact: true }).fill('555-0199')
    await page.getByRole('button', { name: 'Search saved cases', exact: true }).click()
    await visible(page.getByRole('alert').filter({ hasText: 'Enter one phone number with 10–15 digits.' }))
    await page.getByRole('button', { name: 'Look up 4155550199', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'Found in 1 saved case', exact: true }))
    assert.equal(await page.getByRole('article').count(), 1)
    assert.equal(await page.getByRole('article', { name: 'Second phone QA case', exact: true }).count(), 1)
    await page.getByRole('button', { name: 'Open help agent', exact: true }).click()
    await helper.getByRole('button', { name: 'Help on this page', exact: true }).click()
    await visible(helper.getByRole('heading', { name: 'Track a number in your saved cases', exact: true }))
    await helper.getByRole('button', { name: 'Close helper panel', exact: true }).click()
    await page.getByRole('button', { name: 'Look up +14155550199', exact: true }).click()
    await page.getByRole('article', { name: 'First phone QA case', exact: true }).getByRole('button', { name: 'Open this case', exact: true }).click()
    await visible(page.getByRole('heading', { name: 'First phone QA case', exact: true }))
    const openedPhoneStore = await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))
    assert.equal(openedPhoneStore.activeCaseId, 'phone-a')
    assert.deepEqual(openedPhoneStore.cases, phoneCases, 'Opening a phone match changed the source evidence')
    assert.deepEqual(errors, [], `${name} browser errors`)
    assert.deepEqual(outsideRequests, [], `${name} unexpectedly transmitted data outside the app origin`)
    results.push({ viewport: name, status: 'passed', stories: ['home', 'five-step guide preserves existing cases', 'helper navigation, keyboard close, private questions, and unsaved draft preservation', 'phone tracker matches, no-match uncertainty, country-code separation, and source-case opening', 'message-check privacy and invalidation', 'help persistence', '20 academy scenarios and persistence', 'legacy case preservation', 'case export', 'preview-before-commit intake and handoff', 'inferred-only scan recording', 'empty-case directions and unsaved draft preservation', 'first record survives reload and workspace backup', 'screenshot reload, modal keyboard close, original download, preserved description, and image-inclusive workspace/case/handoff JSON', 'four radar bands, unknown state, edited-text invalidation, and unchanged evidence'], browserErrors: errors.length, externalRequests: outsideRequests.length })
    await context.close()
  }

  const countImages = (page) => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('scamalax.screenshots.v1', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('images', 'readonly')
      const count = transaction.objectStore('images').count()
      transaction.oncomplete = () => { db.close(); resolve(count.result) }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
    }
  }))

  for (const failure of ['workspace-full', 'image-full', 'image-blocked', 'invalid-image', 'receipt-only']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    try {
      const page = await context.newPage()
      const errors = []
      const outsideRequests = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => { if (new URL(request.url()).origin !== origin) outsideRequests.push(request.url()) })
      await page.goto(base)
      await page.evaluate(() => localStorage.setItem('scamalax.state.v1', JSON.stringify({ cases: [{ id: 'case-failure', title: 'Fictional storage check', status: 'OPEN', createdAt: '2026-01-01T00:00:00.000Z', evidence: [], timeline: [], analystLinks: [], notes: '' }], activeCaseId: 'case-failure' })))
      await page.getByRole('button', { name: 'My cases', exact: true }).click()
      await page.getByLabel('Message or what happened', { exact: true }).fill('Fictional description that must not disappear.')
      const before = await page.evaluate(() => localStorage.getItem('scamalax.state.v1'))
      if (failure === 'workspace-full') await page.evaluate(() => {
        window.qaOriginalSetItem = Storage.prototype.setItem
        Storage.prototype.setItem = function (key, value) {
          if (key === 'scamalax.state.v1') throw new DOMException('Full', 'QuotaExceededError')
          return window.qaOriginalSetItem.call(this, key, value)
        }
      })
      if (failure === 'image-full') await page.evaluate(() => { IDBObjectStore.prototype.add = () => { throw new DOMException('Full', 'QuotaExceededError') } })
      if (failure === 'image-blocked') await page.evaluate(() => { indexedDB.open = () => { throw new DOMException('Blocked', 'SecurityError') } })
      const file = failure === 'invalid-image' ? { name: 'pretend-screenshot.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/image"/></svg>') } : imageFixture
      await page.getByLabel('Screenshot or original file (optional)', { exact: true }).setInputFiles(file)
      if (failure === 'receipt-only') await page.getByRole('checkbox', { name: 'Save a viewable copy with this case', exact: true }).uncheck()
      await page.getByRole('button', { name: 'Save record', exact: true }).click()
      if (failure === 'receipt-only') {
        await visible(page.getByRole('heading', { name: '1 saved record', exact: true }))
        const record = await page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')).cases[0].evidence[0])
        assert.equal(record.screenshot, undefined)
        assert.equal(record.value, 'Fictional description that must not disappear.')
        assert.equal(record.sha256, createHash('sha256').update(imageFixture.buffer).digest('hex'))
      } else {
        await visible(page.getByRole('alert').filter({ hasText: failure === 'workspace-full' ? 'The record could not be saved.' : failure === 'image-full' ? 'Browser storage is full.' : failure === 'image-blocked' ? 'Screenshot storage is unavailable.' : 'Choose a valid PNG, JPG, or WebP screenshot.' }))
        assert.equal(await page.evaluate(() => localStorage.getItem('scamalax.state.v1')), before, 'Failed screenshot save changed existing records')
        assert.equal(await page.getByLabel('Message or what happened', { exact: true }).inputValue(), 'Fictional description that must not disappear.')
        assert.equal(await page.getByLabel('Screenshot or original file (optional)', { exact: true }).evaluate((input) => input.files.length), 1)
        if (failure === 'workspace-full' || failure === 'image-full') assert.equal(await countImages(page), 0, 'A failed record write left a stored image behind')
      }
      if (failure === 'workspace-full') {
        await page.evaluate(() => { Storage.prototype.setItem = window.qaOriginalSetItem })
        await page.getByRole('button', { name: 'Save record', exact: true }).click()
        await visible(page.getByRole('heading', { name: '1 saved record', exact: true }))
        assert.equal(await countImages(page), 1)
        page.once('dialog', (dialog) => dialog.accept())
        await page.getByRole('button', { name: 'Delete all local data', exact: true }).click()
        await visible(page.getByText('Local case data and saved screenshots deleted.', { exact: true }))
        assert.equal(await countImages(page), 0, 'Delete all local data kept saved images')
        assert.equal(await page.evaluate(() => localStorage.getItem('scamalax.state.v1')), null)
      }
      assert.deepEqual(errors, [])
      assert.deepEqual(outsideRequests, [])
      results.push({ story: failure + ' screenshot flow preserves data or explicitly saves receipt only', status: 'passed' })
    } finally { await context.close() }
  }

  const shortContext = await browser.newContext({ viewport: { width: 844, height: 390 } })
  const shortPage = await shortContext.newPage()
  await shortPage.goto(base)
  await shortPage.getByRole('button', { name: 'Open help agent', exact: true }).click()
  const shortHelper = shortPage.getByRole('dialog', { name: 'Your app helper', exact: true })
  const shortInput = shortHelper.getByLabel('What do you need help with?')
  await shortInput.scrollIntoViewIfNeeded()
  const inputBounds = await shortInput.boundingBox()
  const panelBounds = await shortHelper.boundingBox()
  assert.ok(inputBounds.y >= panelBounds.y && inputBounds.y + inputBounds.height <= panelBounds.y + panelBounds.height, 'Short viewport clips the helper input')
  await shortInput.fill('What next?')
  await shortHelper.getByRole('button', { name: 'Ask', exact: true }).click()
  await visible(shortHelper.getByRole('heading', { name: 'Start with one clear step', exact: true }))
  const chatBounds = await shortHelper.getByRole('log', { name: 'Helper conversation', exact: true }).boundingBox()
  assert.ok(chatBounds.y >= panelBounds.y && chatBounds.y + chatBounds.height <= panelBounds.y + panelBounds.height, 'Short viewport clips the helper reply area')
  const replyHeading = shortHelper.getByRole('heading', { name: 'Start with one clear step', exact: true })
  await replyHeading.scrollIntoViewIfNeeded()
  assert.equal(await replyHeading.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
  }), true, 'Sticky helper header covers the answer')
  await shortPage.screenshot({ path: 'test-results/landscape-app-helper.png' })
  await shortHelper.getByRole('button', { name: 'Close helper panel', exact: true }).click()
  await shortPage.evaluate(() => localStorage.setItem('scamalax.state.v1', 'not-json'))
  await shortPage.getByRole('button', { name: 'Number tracker', exact: true }).click()
  await visible(shortPage.getByRole('alert').filter({ hasText: 'Saved cases could not be read in this browser.' }))
  assert.equal(await shortPage.evaluate(() => localStorage.getItem('scamalax.state.v1')), 'not-json', 'Tracker overwrote unreadable case data')
  await shortPage.getByRole('button', { name: 'My cases', exact: true }).click()
  await visible(shortPage.getByRole('alert').filter({ hasText: 'Saved cases could not be read in this browser.' }))
  assert.equal(await shortPage.evaluate(() => localStorage.getItem('scamalax.state.v1')), 'not-json', 'Workstation overwrote unreadable case data')
  results.push({ story: 'helper remains usable in a short landscape viewport', status: 'passed' })
  await shortContext.close()

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
  await blockedPage.getByRole('button', { name: 'Open help agent', exact: true }).click()
  const blockedHelper = blockedPage.getByRole('dialog', { name: 'Your app helper', exact: true })
  await blockedHelper.getByRole('button', { name: 'Save my story', exact: true }).click()
  await visible(blockedHelper.getByRole('heading', { name: 'Save your story as a record', exact: true }))
  await blockedHelper.getByRole('button', { name: 'Close helper panel', exact: true }).click()
  await blockedPage.getByRole('button', { name: 'Number tracker', exact: true }).click()
  await visible(blockedPage.getByRole('alert').filter({ hasText: 'Saved cases could not be read in this browser.' }))
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
