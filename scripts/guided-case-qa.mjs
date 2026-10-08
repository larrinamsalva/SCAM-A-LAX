import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const visible = (locator) => locator.waitFor({ state: 'visible' })
const workspace = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('scamalax.state.v1')))
async function imageCount(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('scamalax.screenshots.v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id' })
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('images', 'readonly')
      const count = transaction.objectStore('images').count()
      transaction.oncomplete = () => { db.close(); resolve(count.result) }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
    }
  }))
}

async function goToReview(page, story) {
  await page.getByLabel('What happened?', { exact: true }).fill(story)
  await page.getByRole('button', { name: 'Continue to evidence', exact: true }).click()
  await page.getByRole('button', { name: 'Review case', exact: true }).click()
}

export async function verifyGuidedCases({ browser, base, imageFixture }) {
  const results = []
  const origin = new URL(base).origin
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport })
    try {
      const page = await context.newPage()
      const errors = [], requests = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => { if (new URL(request.url()).origin !== origin) requests.push(request.url()) })
      await page.goto(base + '#cases')
      await visible(page.getByRole('heading', { name: 'Save a new case', exact: true }))
      await page.getByRole('button', { name: 'Continue to evidence', exact: true }).click()
      assert.equal(await page.getByRole('heading', { name: '2. Add supporting details', exact: true }).count(), 0)
      const story = 'Fictional delivery message: send gift cards right now. <img src="https://example.invalid/private"> is text, not an image.'
      await page.getByLabel('What happened?', { exact: true }).fill(story)
      await page.getByLabel('Case name (optional)', { exact: true }).fill('Fictional delivery case')
      await page.getByLabel('Scam category', { exact: true }).selectOption('Shopping or marketplace')
      await page.getByLabel('When did it happen? (optional)', { exact: true }).fill('2026-01-02')
      await page.getByLabel('Approximate money lost in USD (optional)', { exact: true }).fill('25.5')
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `test-results/${name}-guided-story.png`, fullPage: true })
      await page.getByRole('button', { name: 'Open help agent', exact: true }).click()
      const helper = page.getByRole('dialog', { name: 'Your app helper', exact: true })
      await helper.getByRole('button', { name: 'Save my story', exact: true }).click()
      await visible(helper.getByRole('heading', { name: 'Save your story as a record', exact: true }))
      await page.keyboard.press('Escape')
      assert.equal(await page.getByLabel('What happened?', { exact: true }).inputValue(), story)
      await page.getByRole('button', { name: 'Overview', exact: true }).click()
      await page.getByRole('button', { name: 'My cases', exact: true }).click()
      assert.equal(await page.getByLabel('What happened?', { exact: true }).inputValue(), story)
      assert.equal(await page.evaluate(() => localStorage.getItem('scamalax.state.v1')), null, 'Draft was stored as a case before Save case')
      await page.getByRole('button', { name: 'Continue to evidence', exact: true }).click()
      await page.getByLabel('Contact details or identifiers (optional)', { exact: true }).fill('+1 415 555 0199; training@example.invalid')
      await page.getByLabel('Screenshot or original file for this case (optional)', { exact: true }).setInputFiles(imageFixture)
      await visible(page.getByRole('img', { name: 'Selected screenshot preview', exact: true }))
      await page.getByRole('button', { name: 'Start here', exact: true }).click()
      await page.getByRole('button', { name: 'My cases', exact: true }).click()
      await visible(page.getByText(`Selected: ${imageFixture.name}`, { exact: false }).first())
      await page.getByRole('button', { name: 'Review case', exact: true }).click()
      await page.getByRole('button', { name: 'Back to evidence', exact: true }).click()
      await page.getByRole('button', { name: 'Back to story', exact: true }).click()
      const finalStory = story + ' I have not verified the caller.'
      await page.getByLabel('What happened?', { exact: true }).fill(finalStory)
      await page.getByRole('button', { name: 'Continue to evidence', exact: true }).click()
      await page.getByRole('button', { name: 'Review case', exact: true }).click()
      // Two submit events must create just one case, even during image hashing.
      await page.getByRole('button', { name: 'Save case', exact: true }).evaluate((button) => { button.form.requestSubmit(); button.form.requestSubmit() })
      await visible(page.getByText('Case and story saved in this browser.', { exact: true }))
      await visible(page.getByRole('heading', { name: '3 saved records', exact: true }))
      const first = (await workspace(page)).cases[0]
      assert.equal((await workspace(page)).cases.length, 1)
      assert.equal(first.incidentDate, '2026-01-02')
      assert.deepEqual(first.reportedLoss, { amount: '25.50', currency: 'USD', approximate: true })
      const originalStatement = first.evidence.find((record) => record.value === finalStory)
      assert.equal(originalStatement.sourceType, 'USER_STATEMENT')
      assert.equal(originalStatement.state, 'OBSERVED')
      const originalFile = first.evidence.find((record) => record.fileName)
      assert.equal(originalFile.sha256, createHash('sha256').update(imageFixture.buffer).digest('hex'))
      await visible(page.getByRole('img', { name: `Saved screenshot: ${imageFixture.name}`, exact: true }))
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Guided flow has horizontal overflow')
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `test-results/${name}-guided-saved-case.png`, fullPage: true })
      await page.reload()
      await visible(page.getByRole('heading', { name: '3 saved records', exact: true }))
      await page.getByRole('img', { name: `Saved screenshot: ${imageFixture.name}`, exact: true }).evaluate((image) => image.decode())
      assert.deepEqual((await workspace(page)).cases[0], first)
      await page.getByLabel('Find a saved case', { exact: true }).fill('training@EXAMPLE.invalid')
      assert.equal(await page.locator('.case-list .case-row').count(), 1)
      await page.getByLabel('Find a saved case', { exact: true }).fill('not-present-in-any-case')
      await visible(page.getByText('No cases match these filters. Your saved cases are unchanged.', { exact: true }))
      assert.equal(await page.locator('.case-list .case-row').count(), 0)
      assert.deepEqual((await workspace(page)).cases[0], first)
      await page.getByRole('button', { name: 'Clear case filters', exact: true }).click()
      await page.getByLabel('Filter case status', { exact: true }).selectOption('CLOSED')
      assert.equal(await page.locator('.case-list .case-row').count(), 0)
      await page.getByLabel('Filter case status', { exact: true }).selectOption('all')
      const sourceCard = page.locator('.evidence-card').filter({ hasText: finalStory })
      await sourceCard.getByRole('button', { name: 'Add a clarification', exact: true }).click()
      await page.getByLabel('Correction or clarification', { exact: true }).fill('Fictional clarification: the message arrived Tuesday, not Monday.')
      await page.getByRole('button', { name: 'Save clarification', exact: true }).click()
      await visible(page.getByRole('heading', { name: '4 saved records', exact: true }))
      const clarified = (await workspace(page)).cases[0]
      assert.deepEqual(clarified.evidence.find((record) => record.id === originalStatement.id), originalStatement)
      assert.deepEqual(clarified.evidence.find((record) => record.id === originalFile.id), originalFile)
      assert.equal(clarified.evidence[0].correctsRecordId, originalStatement.id)
      await sourceCard.getByRole('button', { name: 'Add a clarification', exact: true }).click()
      await page.getByLabel('Correction or clarification', { exact: true }).fill('Unsaved fictional clarification.')
      page.once('dialog', (dialog) => dialog.dismiss())
      await page.getByRole('button', { name: 'Overview', exact: true }).click()
      assert.equal(await page.getByLabel('Correction or clarification', { exact: true }).inputValue(), 'Unsaved fictional clarification.')
      assert.equal(new URL(page.url()).hash, '#cases')
      page.once('dialog', (dialog) => dialog.dismiss())
      await page.evaluate(() => { window.location.hash = 'guide' })
      await page.waitForFunction(() => window.location.hash === '#cases')
      assert.equal(await page.getByLabel('Correction or clarification', { exact: true }).inputValue(), 'Unsaved fictional clarification.')
      page.once('dialog', (dialog) => dialog.dismiss())
      await page.getByRole('button', { name: 'Cancel clarification', exact: true }).click()
      assert.equal(await page.getByLabel('Correction or clarification', { exact: true }).inputValue(), 'Unsaved fictional clarification.')
      page.once('dialog', (dialog) => dialog.accept())
      await page.getByRole('button', { name: 'Cancel clarification', exact: true }).click()
      assert.deepEqual((await workspace(page)).cases[0], clarified)
      const backupDownload = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Backup workspace', exact: true }).click()
      const backup = JSON.parse(await readFile(await (await backupDownload).path(), 'utf8'))
      assert.deepEqual(backup.store.cases[0], clarified)
      assert.equal(backup.attachments[0].dataUrl, 'data:image/png;base64,' + imageFixture.buffer.toString('base64'))
      await page.getByRole('button', { name: 'Case Packet', exact: true }).click()
      const reportDownload = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download Markdown packet', exact: true }).click()
      const report = await readFile(await (await reportDownload).path(), 'utf8')
      assert.ok(report.includes('25.50 USD') && report.includes('2026-01-02') && report.includes('User statement, not independently verified') && report.includes('original retained'))
      await page.getByRole('button', { name: 'Open Evidence Intake', exact: true }).click()
      const handoffDownload = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download JSON handoff', exact: true }).click()
      const handoff = JSON.parse(await readFile(await (await handoffDownload).path(), 'utf8'))
      assert.equal(handoff.case.reportedLoss.amount, '25.50')
      assert.equal(handoff.case.incidentDate, '2026-01-02')
      assert.deepEqual(handoff.evidence, clarified.evidence)
      assert.equal(handoff.attachments[0].dataUrl, backup.attachments[0].dataUrl)
      await page.getByRole('button', { name: 'Return to workstation', exact: true }).click()
      await page.getByRole('button', { name: 'Save a new case', exact: true }).click()
      await goToReview(page, 'Another fictional incident, no known loss or name.')
      await page.getByRole('button', { name: 'Save case', exact: true }).click()
      await visible(page.getByRole('heading', { name: '1 saved record', exact: true }))
      const second = (await workspace(page)).cases[0]
      assert.match(second.title, /^Scam case — /)
      assert.notEqual(second.id, first.id)
      assert.equal(second.reportedLoss, undefined)
      assert.deepEqual((await workspace(page)).cases[1], clarified)
      await page.getByLabel('Sort saved cases', { exact: true }).selectOption('oldest')
      assert.ok((await page.locator('.case-list .case-row').first().innerText()).includes(first.title))
      await page.getByLabel('Sort saved cases', { exact: true }).selectOption('title')
      assert.ok((await page.locator('.case-list .case-row').first().innerText()).includes(first.title))
      await page.getByLabel('Find a saved case', { exact: true }).fill(originalFile.fileName)
      await page.locator('.case-list .case-row').click()
      await visible(page.getByRole('heading', { name: '4 saved records', exact: true }))
      await page.getByLabel('Message or what happened', { exact: true }).fill('Unsaved fictional record to protect.')
      page.once('dialog', (dialog) => dialog.dismiss())
      await page.getByRole('button', { name: 'ScamCheck', exact: true }).click()
      assert.equal(await page.getByLabel('Message or what happened', { exact: true }).inputValue(), 'Unsaved fictional record to protect.')
      page.once('dialog', (dialog) => dialog.accept())
      await page.getByRole('button', { name: 'Overview', exact: true }).click()
      await visible(page.getByRole('heading', { name: /A little pause/ }))
      await page.getByRole('button', { name: 'My cases', exact: true }).click()
      assert.equal(await page.getByLabel('Message or what happened', { exact: true }).inputValue(), '')
      assert.deepEqual((await workspace(page)).cases.find((item) => item.id === first.id), clarified)
      assert.deepEqual(errors, [])
      assert.deepEqual(requests, [])
      results.push({ viewport: name, story: 'guided case: required story, editable review, helper and navigation draft retention, image save, duplicate-submit guard, reload, search/filter/sort, history-preserving clarification, and accurate exports', status: 'passed', browserErrors: errors.length, externalRequests: requests.length })
    } finally { await context.close() }
  }

  for (const failure of ['workspace-full', 'image-full', 'image-blocked', 'invalid-image', 'corrupt-workspace']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    try {
      const page = await context.newPage()
      const errors = [], requests = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => { if (new URL(request.url()).origin !== origin) requests.push(request.url()) })
      await page.goto(base)
      if (failure === 'corrupt-workspace') await page.evaluate(() => localStorage.setItem('scamalax.state.v1', 'unreadable-original'))
      await page.getByRole('button', { name: 'My cases', exact: true }).click()
      await page.getByLabel('What happened?', { exact: true }).fill('Fictional draft that must survive a failed save.')
      await page.getByRole('button', { name: 'Continue to evidence', exact: true }).click()
      const file = failure === 'invalid-image' ? { name: 'pretend.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/image"/></svg>') } : imageFixture
      await page.getByLabel('Screenshot or original file for this case (optional)', { exact: true }).setInputFiles(file)
      await page.getByRole('button', { name: 'Review case', exact: true }).click()
      const before = await page.evaluate(() => localStorage.getItem('scamalax.state.v1'))
      if (failure === 'workspace-full') await page.evaluate(() => {
        window.qaSetItem = Storage.prototype.setItem
        Storage.prototype.setItem = function (key, value) { if (key === 'scamalax.state.v1') throw new DOMException('Full', 'QuotaExceededError'); return window.qaSetItem.call(this, key, value) }
      })
      if (failure === 'image-full') await page.evaluate(() => { IDBObjectStore.prototype.add = () => { throw new DOMException('Full', 'QuotaExceededError') } })
      if (failure === 'image-blocked') await page.evaluate(() => { indexedDB.open = () => { throw new DOMException('Blocked', 'SecurityError') } })
      await page.getByRole('button', { name: 'Save case', exact: true }).click()
      await visible(page.getByRole('alert').filter({ hasText: 'The case and story were not saved. Your draft is still here.' }))
      assert.equal(await page.evaluate(() => localStorage.getItem('scamalax.state.v1')), before)
      assert.equal(await page.getByText('Case and story saved in this browser.', { exact: true }).count(), 0)
      if (failure === 'workspace-full' || failure === 'image-full') assert.equal(await imageCount(page), 0, 'Failed case save left an image behind')
      await page.getByRole('button', { name: 'Back to evidence', exact: true }).click()
      await visible(page.getByText(`Selected: ${file.name}`, { exact: false }).first())
      await page.getByRole('button', { name: 'Back to story', exact: true }).click()
      assert.equal(await page.getByLabel('What happened?', { exact: true }).inputValue(), 'Fictional draft that must survive a failed save.')
      if (failure === 'workspace-full') {
        await page.evaluate(() => { Storage.prototype.setItem = window.qaSetItem })
        await page.getByRole('button', { name: 'Continue to evidence', exact: true }).click()
        await page.getByRole('button', { name: 'Review case', exact: true }).click()
        await page.getByRole('button', { name: 'Save case', exact: true }).click()
        await visible(page.getByRole('heading', { name: '2 saved records', exact: true }))
        assert.equal((await workspace(page)).cases.length, 1)
        assert.equal(await imageCount(page), 1)
      }
      assert.deepEqual(errors, [])
      assert.deepEqual(requests, [])
      results.push({ story: `${failure}: no partial case, no false success, draft and original data preserved`, status: 'passed' })
    } finally { await context.close() }
  }

  for (const mode of ['latest-records', 'storage-full', 'deleted-case']) {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const item = { id: 'case-intake', title: 'Fictional intake case', status: 'OPEN', type: 'Training', createdAt: '2026-01-01T00:00:00.000Z', notes: '', evidence: [], timeline: [], analystLinks: [] }
      await page.evaluate((item) => localStorage.setItem('scamalax.state.v1', JSON.stringify({ cases: [item], activeCaseId: item.id })), item)
      await page.getByRole('button', { name: 'My cases', exact: true }).click()
      await page.getByRole('button', { name: 'Open Evidence Intake', exact: true }).click()
      await page.getByLabel('Paste source text').fill('Fictional intake statement.')
      await page.getByRole('button', { name: 'Build preview', exact: true }).click()
      await visible(page.getByRole('heading', { name: '1 proposed records', exact: true }))
      const newer = { id: 'newer-record', kind: 'note', state: 'DISPUTED', value: 'Fictional other-tab record.', note: '', sha256: 'b'.repeat(64), recordedAt: item.createdAt }
      const fresh = { cases: [{ ...item, evidence: [newer] }, { ...item, id: 'other-tab-case', title: 'Another tab case' }], activeCaseId: item.id }
      await page.evaluate((store) => localStorage.setItem('scamalax.state.v1', JSON.stringify(store)), mode === 'deleted-case' ? { cases: [], activeCaseId: null } : fresh)
      const before = await page.evaluate(() => localStorage.getItem('scamalax.state.v1'))
      if (mode === 'storage-full') await page.evaluate(() => {
        window.qaSetItem = Storage.prototype.setItem
        Storage.prototype.setItem = function (key, value) { if (key === 'scamalax.state.v1') throw new DOMException('Full', 'QuotaExceededError'); return window.qaSetItem.call(this, key, value) }
      })
      await page.getByRole('button', { name: 'Hash + commit selected evidence', exact: true }).click()
      if (mode === 'latest-records') {
        await visible(page.getByText('1 evidence record committed. Original file bytes were not stored.', { exact: true }))
        const saved = await workspace(page)
        assert.deepEqual(saved.cases[0].evidence[1], newer)
        assert.deepEqual(saved.cases[1], fresh.cases[1])
      } else {
        await visible(page.getByRole('alert').filter({ hasText: 'Evidence was not saved.' }))
        assert.equal(await page.evaluate(() => localStorage.getItem('scamalax.state.v1')), before)
        assert.equal(await page.getByLabel('Paste source text').inputValue(), 'Fictional intake statement.')
        await visible(page.getByRole('heading', { name: '1 proposed records', exact: true }))
        if (mode === 'storage-full') {
          await page.evaluate(() => { Storage.prototype.setItem = window.qaSetItem })
          await page.getByRole('button', { name: 'Hash + commit selected evidence', exact: true }).click()
          await visible(page.getByText('1 evidence record committed. Original file bytes were not stored.', { exact: true }))
          assert.deepEqual((await workspace(page)).cases[0].evidence[1], newer)
        }
      }
      assert.deepEqual(errors, [])
      results.push({ story: `advanced intake ${mode}: fresh writes, failure recovery, and no historical data replacement`, status: 'passed' })
    } finally { await context.close() }
  }
  return results
}
