export const SCREENSHOT_LIMIT = 10 * 1024 * 1024
export const SCREENSHOT_DB = 'scamalax.screenshots.v1'
const IMAGE_STORE = 'images'

export function isScreenshotFile(file) {
  return Boolean(file && (/^image\/(png|jpeg|webp)$/.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name || '')))
}

export function screenshotType(bytes) {
  const b = new Uint8Array(bytes)
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => b[index] === value)) return 'image/png'
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg'
  if ([82, 73, 70, 70].every((value, index) => b[index] === value) && [87, 69, 66, 80].every((value, index) => b[index + 8] === value)) return 'image/webp'
  return null
}

export function screenshotIds(cases = []) {
  return [...new Set(cases.flatMap((item) => (item.evidence || []).map((record) => record.screenshot?.id).filter(Boolean)))]
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Screenshot storage is unavailable in this browser.')); return }
    const request = indexedDB.open(SCREENSHOT_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(IMAGE_STORE, { keyPath: 'id' })
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Close other SCAM-A-LAX tabs and try again.'))
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

async function imageTransaction(mode, action) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    let request
    try {
      const transaction = db.transaction(IMAGE_STORE, mode)
      request = action(transaction.objectStore(IMAGE_STORE))
      transaction.oncomplete = () => { db.close(); resolve(request?.result) }
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Screenshot storage could not complete the request.')) }
      transaction.onerror = () => { /* The abort handler reports failed writes. */ }
    } catch (error) { db.close(); reject(error) }
  })
}

export async function prepareScreenshot(file, bytes, sha256) {
  if (file.size > SCREENSHOT_LIMIT) throw new Error('Choose a screenshot smaller than 10 MB. Your record has not been saved.')
  const type = screenshotType(bytes)
  if (!type) throw new Error('Choose a valid PNG, JPG, or WebP screenshot. Your record has not been saved.')
  const blob = new Blob([bytes], { type })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('This image is too large to view. Choose a smaller screenshot.')
    return { id: `shot-${crypto.randomUUID()}`, fileName: file.name, size: file.size, type, sha256, width: image.naturalWidth, height: image.naturalHeight, blob }
  } catch (error) {
    if (error.name === 'EncodingError') throw new Error('This screenshot could not be opened. Try another PNG, JPG, or WebP image.')
    throw error
  } finally { URL.revokeObjectURL(url) }
}

export const saveScreenshot = (image) => imageTransaction('readwrite', (store) => store.add(image))
export const getScreenshot = (id) => imageTransaction('readonly', (store) => store.get(id))
export const removeScreenshot = (id) => imageTransaction('readwrite', (store) => store.delete(id))
export const clearScreenshots = () => imageTransaction('readwrite', (store) => store.clear())

function asDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function exportScreenshots(cases) {
  const attachments = []
  for (const id of screenshotIds(cases)) {
    const image = await getScreenshot(id)
    if (!image) throw new Error('A saved screenshot is missing. Download its original separately before relying on this backup.')
    const { blob, ...metadata } = image
    attachments.push({ ...metadata, dataUrl: await asDataUrl(blob) })
  }
  return attachments
}

export function screenshotError(error) {
  if (error?.name === 'QuotaExceededError') return 'Browser storage is full. The screenshot and record were not saved. Download a backup and keep the original image.'
  if (error?.name === 'SecurityError' || error?.name === 'InvalidStateError') return 'Screenshot storage is unavailable. The screenshot and record were not saved. Keep the original image and try a browser that allows storage.'
  return error?.message || 'The screenshot could not be saved. Keep the original image and try again.'
}
