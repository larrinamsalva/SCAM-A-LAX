import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { GUIDED_QUESTIONS } from '../src/guided-radar.js'

const visible = (locator) => locator.waitFor({ state: 'visible' })
const rawWorkspace = (page) => page.evaluate(() => localStorage.getItem('scamalax.state.v1'))
const workspace = async (page) => JSON.parse(await rawWorkspace(page))
const hash = (value) => createHash('sha256').update(value).digest('hex')
const storedCase = (id = 'contact-case') => ({ id, title: 'Fictional contact history', status: 'OPEN', type: 'Training', createdAt: '2026-01-01T00:00:00.000Z', notes: 'Retain these original notes.', evidence: [{ id: 'prior-record', kind: 'note', state: 'DISPUTED', value: 'Original source statement.', note: 'Retain the caveat.', recordedAt: '2026-01-01T00:00:00.000Z', sha256: 'a'.repeat(64) }], timeline: [{ id: 'prior-event', at: '2026-01-01T00:00:00.000Z', text: 'Original event.' }], analystLinks: [] })
async function openLog(page, base) {
  await page.goto(base)
  const item = storedCase()
  await page.evaluate((item) => localStorage.setItem('scamalax.state.v1', JSON.stringify({ cases: [item], activeCaseId: item.id, extraWorkspaceField: 'retain' })), item)
  await page.getByRole('button', { name: 'My cases', exact: true }).click()
  await page.getByRole('button', { name: 'Call & message log', exact: true }).click()
  await visible(page.getByRole('heading', { name: 'Save a call or message', exact: true }))
  return item
}
async function imageCount(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Screenshot count did not complete within 10 seconds')), 10000)
    const request = indexedDB.open('scamalax.screenshots.v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id' })
    request.onerror = () => { clearTimeout(timer); reject(request.error) }
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('images', 'readonly'), count = transaction.objectStore('images').count()
      transaction.oncomplete = () => { clearTimeout(timer); db.close(); resolve(count.result) }
      transaction.onabort = () => { clearTimeout(timer); db.close(); reject(transaction.error) }
    }
  }))
}
async function downloadText(page, button) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: button, exact: true }).click()
  return readFile(await (await pending).path(), 'utf8')
}
async function decodeScreenshot(page, name) {
  const image = page.getByRole('img', { name: `Saved screenshot: ${name}`, exact: true })
  // Screenshot uses native lazy loading. Follow the user's scroll before
  // decoding; page.evaluate alone does not bring a distant image into view.
  await image.scrollIntoViewIfNeeded()
  await image.evaluate((element) => Promise.race([
    element.decode(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Saved screenshot did not decode within 10 seconds')), 10000)),
  ]))
}

export async function verifyContactLog({ browser, base, imageFixture }) {
  const results = [], origin = new URL(base).origin
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, ...(name === 'mobile' ? { isMobile: true, hasTouch: true } : {}) })
    try {
      const page = await context.newPage(), errors = [], externalRequests = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
      page.on('request', (request) => { if (new URL(request.url()).origin !== origin) externalRequests.push(request.url()) })
      const prior = await openLog(page, base)
      console.log(`Contact QA: ${name} form and draft protection`)
      if (name === 'mobile') {
        const [formBox, historyBox] = await Promise.all([page.locator('.contact-log > section').first().boundingBox(), page.locator('.contact-log > section').last().boundingBox()])
        assert.ok(formBox && historyBox && historyBox.y >= formBox.y + formBox.height - 1, 'Phone contact form and history must stack vertically')
        assert.ok(formBox.width >= viewport.width - 100 && historyBox.width >= viewport.width - 100, 'Phone contact cards became too narrow to read')
      }
      const beforeDraft = await rawWorkspace(page)
      await page.getByLabel('Contact date (optional)', { exact: true }).fill('2026-01-02')
      await page.getByLabel('Contact time (optional)', { exact: true }).fill('15:07')
      await page.getByLabel('Time zone (optional)', { exact: true }).fill('Pacific time')
      await page.getByLabel('Displayed number, email, or sender (optional)', { exact: true }).fill('+1 415 555 0199')
      await page.getByLabel('Number they told you to call back (optional)', { exact: true }).fill('+1 415 555 0100')
      await page.getByLabel('Claimed name or organization (optional)', { exact: true }).fill('Claimed refund agent — unverified')
      await page.getByLabel('Language used (if known)', { exact: true }).fill('हिन्दी / Hindi, reported by the user')
      const story = 'Fictional caller kept me on the phone at the register, then called back after I hung up. <img src="https://example.invalid/private"> and ~~~ are text, not instructions.'
      await page.getByLabel('What was said or sent?', { exact: true }).fill(story)
      await page.getByText('Store, payment, and phone-pressure details (optional)', { exact: true }).click()
      await page.getByLabel('Store, bank, or destination (optional)', { exact: true }).fill('Fictional market register')
      await page.getByLabel('Payment they requested (optional)', { exact: true }).fill('250 USD in gift cards; not paid')
      await page.getByLabel('Kept you on the phone through a purchase or withdrawal?', { exact: true }).selectOption('yes')
      await page.getByLabel('Called back quickly and pressured you to continue?', { exact: true }).selectOption('yes')
      await page.getByLabel('Told you a cover story for the cashier or bank?', { exact: true }).selectOption('unsure')
      await page.getByLabel('What did you do next? (optional)', { exact: true }).fill('I ended the call and spoke to the store employee.')
      await page.getByLabel('Screenshot or original file for this contact (optional)', { exact: true }).setInputFiles(imageFixture)
      assert.equal(await rawWorkspace(page), beforeDraft)
      const cancelled = page.waitForEvent('dialog').then((dialog) => dialog.dismiss())
      await page.getByRole('button', { name: 'Easy Scam Radar', exact: true }).click()
      await cancelled
      assert.equal(new URL(page.url()).hash, '#cases')
      assert.equal(await page.getByLabel('What was said or sent?', { exact: true }).inputValue(), story)
      const cancelTab = page.waitForEvent('dialog').then((dialog) => dialog.dismiss())
      await page.getByRole('button', { name: 'Case Packet', exact: true }).click()
      await cancelTab
      assert.equal(await page.getByLabel('Language used (if known)', { exact: true }).inputValue(), 'हिन्दी / Hindi, reported by the user')
      await page.getByRole('button', { name: 'Review contact record', exact: true }).click()
      await visible(page.getByRole('heading', { name: 'Review contact record', exact: true }))
      await page.waitForFunction(() => document.activeElement?.id === 'contact-log-heading')
      assert.equal(await rawWorkspace(page), beforeDraft, 'Review prematurely saved the contact')
      await page.screenshot({ path: `test-results/${name}-contact-review.png` })
      await page.screenshot({ path: `test-results/${name}-contact-review.jpg`, type: 'jpeg', quality: 65 })
      // A rapid duplicate submit must still save only one statement and file.
      await page.getByRole('button', { name: 'Save contact record', exact: true }).evaluate((button) => { button.form.requestSubmit(); button.form.requestSubmit() })
      await visible(page.getByText('Contact record saved in this case and this browser.', { exact: true }))
      await visible(page.getByRole('heading', { name: '1 saved contact', exact: true }))
      const saved = await workspace(page), item = saved.cases[0], contact = item.evidence.find((record) => record.contact), attachment = item.evidence.find((record) => record.relatedContactId)
      console.log(`Contact QA: ${name} saved; verifying receipts and reload`)
      assert.equal(item.evidence.length, 3)
      assert.equal(contact.contact.whatHappened, story)
      assert.equal(contact.contact.language, 'हिन्दी / Hindi, reported by the user')
      assert.equal(contact.contact.time, '15:07')
      assert.equal(contact.contact.timeZone, 'Pacific time')
      assert.equal(contact.sourceType, 'USER_STATEMENT')
      assert.equal(contact.sha256, hash(`${contact.kind}\n${contact.value}`))
      assert.equal(attachment.relatedContactId, contact.id)
      assert.equal(contact.attachmentRecordId, attachment.id)
      assert.equal(attachment.sha256, hash(imageFixture.buffer))
      assert.deepEqual(item.evidence[2], prior.evidence[0])
      assert.deepEqual(item.timeline[1], prior.timeline[0])
      assert.equal(saved.extraWorkspaceField, 'retain')
      assert.equal(await imageCount(page), 1)
      await decodeScreenshot(page, imageFixture.name)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Contact log overflowed the phone')
      await page.locator('.contact-saved-record').screenshot({ path: `test-results/${name}-contact-saved.png` })
      await page.reload()
      await page.getByRole('button', { name: 'Call & message log', exact: true }).click()
      await visible(page.getByRole('heading', { name: '1 saved contact', exact: true }))
      assert.deepEqual((await workspace(page)).cases[0], item)
      await decodeScreenshot(page, imageFixture.name)
      await page.getByLabel('Find a saved case', { exact: true }).fill('Hindi')
      assert.equal(await page.locator('.case-list .case-row').count(), 1)
      await page.getByLabel('Find a saved case', { exact: true }).fill('')
      const backup = JSON.parse(await downloadText(page, 'Backup workspace'))
      console.log(`Contact QA: ${name} backup; verifying case and handoff exports`)
      assert.deepEqual(backup.store.cases[0], item)
      assert.equal(backup.attachments.length, 1)
      assert.equal(backup.attachments[0].dataUrl, 'data:image/png;base64,' + imageFixture.buffer.toString('base64'))
      await page.getByRole('button', { name: 'Open case packet downloads', exact: true }).click()
      const markdown = await downloadText(page, 'Download Markdown packet')
      assert.ok(markdown.includes(contact.value))
      assert.ok(markdown.includes('~~~~text'))
      assert.ok(markdown.includes(`**Note saved at:** ${contact.recordedAt}`))
      assert.ok(markdown.includes(`**Attachment for contact record:** ${contact.id}`))
      const archive = JSON.parse(await downloadText(page, 'Download JSON archive'))
      assert.deepEqual(archive.case, item)
      assert.equal(archive.attachments.length, 1)
      await page.getByRole('button', { name: 'Open Evidence Intake', exact: true }).click()
      const handoff = JSON.parse(await downloadText(page, 'Download JSON handoff'))
      assert.deepEqual(handoff.evidence, item.evidence)
      assert.equal(handoff.attachments.length, 1)
      const handoffMarkdown = await downloadText(page, 'Download Markdown handoff')
      assert.ok(handoffMarkdown.includes(contact.value))
      await page.getByRole('button', { name: 'Return to workstation', exact: true }).click()
      console.log(`Contact QA: ${name} exports; verifying clarification and question bank`)
      await page.getByRole('button', { name: 'Scam Ledger', exact: true }).click()
      const statement = page.locator('.evidence-card').filter({ hasText: contact.sha256 }).first()
      // The text receipt identifies the statement itself, not its attachment.
      await statement.getByRole('button', { name: 'Add a clarification', exact: true }).click()
      await page.getByLabel('Correction or clarification', { exact: true }).fill('Fictional clarification: the callback was two minutes later.')
      await page.getByRole('button', { name: 'Save clarification', exact: true }).click()
      await visible(page.getByText('Clarification saved as a new statement. The original record was kept.', { exact: true }))
      assert.deepEqual((await workspace(page)).cases[0].evidence.find((record) => record.id === contact.id), contact)
      await page.getByRole('button', { name: 'Call & message log', exact: true }).click()
      await visible(page.getByText('Fictional clarification: the callback was two minutes later.', { exact: true }))
      // A language-only note change must be guarded too; accepting discard
      // must clear it when navigating away, without adding another record.
      await page.getByLabel('Language used (if known)', { exact: true }).fill('English')
      const cancelLanguage = page.waitForEvent('dialog').then((dialog) => dialog.dismiss())
      await page.getByRole('button', { name: 'Overview', exact: true }).click()
      await cancelLanguage
      assert.equal(await page.getByLabel('Language used (if known)', { exact: true }).inputValue(), 'English')
      const discardLanguage = page.waitForEvent('dialog').then((dialog) => dialog.accept())
      await page.getByRole('button', { name: 'Easy Scam Radar', exact: true }).click()
      await discardLanguage
      await visible(page.getByRole('status', { name: 'Unknown — safety unverified', exact: true }))
      const beforeRadar = await rawWorkspace(page)
      const counts = [6, 30, 54, 88], transforms = []
      for (let index = 0; index < GUIDED_QUESTIONS.length; index++) {
        await visible(page.getByRole('heading', { name: GUIDED_QUESTIONS[index].question, exact: true }))
        if (index >= 16 && index <= 19) {
          await page.getByRole('button', { name: /YES This happened/ }).click()
          assert.equal(await page.getByRole('meter', { name: 'Scam warning strength' }).getAttribute('aria-valuenow'), String(counts[index - 16]))
          transforms.push(await page.locator('.easy-gauge .easy-needle').getAttribute('transform'))
        }
        if (index < GUIDED_QUESTIONS.length - 1) await page.getByRole('button', { name: 'Next question →', exact: true }).click()
      }
      assert.equal(new Set(transforms).size, 4)
      assert.equal(await rawWorkspace(page), beforeRadar, 'Radar wrote contact or language details into storage')
      await page.getByRole('button', { name: 'Start over and clear answers', exact: true }).click()
      await visible(page.getByRole('status', { name: 'Unknown — safety unverified', exact: true }))
      assert.deepEqual(errors, []); assert.deepEqual(externalRequests, [])
      console.log(`Contact QA: ${name} passed`)
      results.push({ viewport: name, status: 'passed', story: 'contact review/save/reload, source time/language, original records, screenshot hash, backup and all exports, clarification, draft guards, 24 questions and four meter bands', browserErrors: errors.length, externalRequests: externalRequests.length })
    } finally { await context.close() }
  }

  for (const failure of ['workspace-full', 'image-full', 'image-blocked', 'invalid-image', 'corrupt-workspace', 'deleted-case']) {
    const context = await browser.newContext()
    try {
      const page = await context.newPage(), errors = [], externalRequests = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => { if (new URL(request.url()).origin !== origin) externalRequests.push(request.url()) })
      await openLog(page, base)
      console.log(`Contact QA: ${failure} save failure`)
      await page.getByLabel('What was said or sent?', { exact: true }).fill('Fictional contact draft that must survive a failed save.')
      const file = failure === 'invalid-image' ? { name: 'pretend.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/private"/></svg>') } : imageFixture
      await page.getByLabel('Screenshot or original file for this contact (optional)', { exact: true }).setInputFiles(file)
      await page.getByRole('button', { name: 'Review contact record', exact: true }).click()
      if (failure === 'workspace-full') await page.evaluate(() => {
        window.contactQASetItem = Storage.prototype.setItem
        Storage.prototype.setItem = function (key, value) { if (key === 'scamalax.state.v1') throw new DOMException('Full', 'QuotaExceededError'); return window.contactQASetItem.call(this, key, value) }
      })
      if (failure === 'image-full') await page.evaluate(() => { IDBObjectStore.prototype.add = () => { throw new DOMException('Full', 'QuotaExceededError') } })
      if (failure === 'image-blocked') await page.evaluate(() => { indexedDB.open = () => { throw new DOMException('Blocked', 'SecurityError') } })
      if (failure === 'corrupt-workspace') await page.evaluate(() => localStorage.setItem('scamalax.state.v1', 'unreadable-original'))
      if (failure === 'deleted-case') await page.evaluate(() => localStorage.setItem('scamalax.state.v1', '{"cases":[],"activeCaseId":null}'))
      const before = await rawWorkspace(page)
      await page.getByRole('button', { name: 'Save contact record', exact: true }).click()
      await visible(page.getByRole('alert').filter({ hasText: 'The contact record was not saved. Your draft is still here.' }))
      assert.equal(await rawWorkspace(page), before)
      assert.equal(await page.getByText('Contact record saved in this case and this browser.', { exact: true }).count(), 0)
      if (failure !== 'image-blocked') assert.equal(await imageCount(page), 0, 'Failed contact save left a staged image')
      await page.getByRole('button', { name: 'Back to contact details', exact: true }).click()
      assert.equal(await page.getByLabel('What was said or sent?', { exact: true }).inputValue(), 'Fictional contact draft that must survive a failed save.')
      await visible(page.getByText(file.name, { exact: true }).first())
      if (failure === 'workspace-full') {
        await page.evaluate(() => { Storage.prototype.setItem = window.contactQASetItem })
        await page.getByRole('button', { name: 'Review contact record', exact: true }).click()
        await page.getByRole('button', { name: 'Save contact record', exact: true }).click()
        await visible(page.getByRole('heading', { name: '1 saved contact', exact: true }))
        assert.equal((await workspace(page)).cases[0].evidence.length, 3)
        assert.equal(await imageCount(page), 1)
      }
      assert.deepEqual(errors, [])
      assert.deepEqual(externalRequests, [])
      console.log(`Contact QA: ${failure} passed`)
      results.push({ status: 'passed', story: `${failure}: contact draft retained, no partial record or false success, rollback/retry where applicable` })
    } finally { await context.close() }
  }
  return results
}
