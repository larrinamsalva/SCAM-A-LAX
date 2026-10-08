const MAX_PREVIEW_ITEMS = 250

const EMAIL_HEADER_NAMES = new Set([
  'from', 'to', 'cc', 'reply-to', 'return-path', 'subject', 'date', 'message-id',
  'received', 'authentication-results', 'received-spf', 'dkim-signature',
])

function clean(value = '') {
  return String(value).replace(/\r\n?/g, '\n').trim()
}

function compact(value = '', max = 180) {
  const normalized = clean(value).replace(/\s+/g, ' ')
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

export function detectIntakeMode(text = '') {
  const value = clean(text)
  if (!value) return 'bulk'

  const headerHits = ['From:', 'To:', 'Subject:', 'Date:', 'Message-ID:', 'Received:']
    .filter((header) => new RegExp(`^${header.replace('-', '\\-')}`, 'im').test(value)).length
  if (headerHits >= 3) return 'email'

  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean)
  const transcriptHits = lines.filter((line) => {
    if (/^https?:\/\//i.test(line)) return false
    if (/^(?:from|to|cc|subject|date|message-id|received):/i.test(line)) return false
    return /^(?:\[[^\]]{1,40}\]\s*)?(?:[^:\n]{1,40}):\s+.+$/.test(line)
  }).length
  if (lines.length >= 2 && transcriptHits / lines.length >= 0.5) return 'transcript'

  return 'bulk'
}

export function parseEmailHeaders(raw = '') {
  const normalized = clean(raw)
  if (!normalized) return { headers: {}, ordered: [], body: '', rawHeader: '' }

  const boundary = normalized.search(/\n\s*\n/)
  const rawHeader = boundary >= 0 ? normalized.slice(0, boundary) : normalized
  const body = boundary >= 0 ? normalized.slice(boundary).replace(/^\n\s*\n/, '') : ''

  const unfolded = rawHeader.replace(/\n[\t ]+/g, ' ')
  const ordered = []
  const headers = {}

  unfolded.split('\n').forEach((line) => {
    const match = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/)
    if (!match) return
    const name = match[1].toLowerCase()
    const value = match[2].trim()
    if (!EMAIL_HEADER_NAMES.has(name)) return
    if (!headers[name]) headers[name] = []
    headers[name].push(value)
    ordered.push({ name, value })
  })

  return { headers, ordered, body, rawHeader }
}

export function summarizeEmailHeaders(parsed) {
  const first = (name) => parsed.headers?.[name]?.[0] || ''
  const received = parsed.headers?.received || []
  const parts = [
    first('from') && `From: ${compact(first('from'), 90)}`,
    first('to') && `To: ${compact(first('to'), 90)}`,
    first('subject') && `Subject: ${compact(first('subject'), 110)}`,
    first('date') && `Date: ${compact(first('date'), 70)}`,
    first('message-id') && `Message-ID: ${compact(first('message-id'), 90)}`,
    received.length && `Received hops: ${received.length}`,
  ].filter(Boolean)
  return parts.join(' · ')
}

export function parseTranscript(text = '') {
  const rows = []
  const lines = clean(text).split('\n')
  let current = null

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    const match = trimmed.match(/^(?:\[([^\]]{1,40})\]\s*)?([^:\n]{1,40}):\s+(.+)$/)
    if (match && !/^https?$/i.test(match[2].trim())) {
      current = {
        timestamp: (match[1] || '').trim(),
        speaker: match[2].trim(),
        text: match[3].trim(),
      }
      rows.push(current)
      return
    }

    if (current) current.text = `${current.text}\n${trimmed}`
    else {
      current = { timestamp: '', speaker: 'Unknown', text: trimmed }
      rows.push(current)
    }
  })

  return rows.slice(0, MAX_PREVIEW_ITEMS)
}

export function splitBulkText(text = '') {
  const value = clean(text)
  if (!value) return []

  const blocks = value
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)

  if (blocks.length > 1) return blocks.slice(0, MAX_PREVIEW_ITEMS)

  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean)
  return (lines.length > 1 ? lines : [value]).slice(0, MAX_PREVIEW_ITEMS)
}

export function suggestEvidenceKind(value = '') {
  const text = clean(value)
  if (!text) return 'note'
  if (/^https?:\/\/\S+$/i.test(text)) return 'url'
  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(text)) return 'email'
  if (/^\+?[\d\s().-]{10,20}$/.test(text) && text.replace(/\D/g, '').length >= 10) return 'phone'
  if (/^0x[a-fA-F0-9]{40}$/.test(text) || /^(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(text)) return 'wallet'
  if (/\b(?:anydesk|teamviewer|ultraviewer|supremo|screenconnect|remote desktop)\b/i.test(text)) return 'remote-access'
  if (/\b(?:wire transfer|zelle|cash app|western union|moneygram|gift card|bitcoin atm|crypto atm|bank transfer)\b/i.test(text)) return 'payment'
  return 'message'
}

function previewRecord(index, kind, value, note, sourceLabel, options = {}) {
  return {
    previewId: `preview-${index + 1}`,
    selected: options.selected ?? true,
    kind,
    state: options.state || 'OBSERVED',
    value: clean(value),
    note: clean([sourceLabel ? `Source: ${sourceLabel}` : '', note].filter(Boolean).join(' · ')),
  }
}

export function buildIntakePreview({ text = '', mode = 'auto', sourceLabel = '' } = {}) {
  const resolvedMode = mode === 'auto' ? detectIntakeMode(text) : mode
  const value = clean(text)
  if (!value) return { mode: resolvedMode, records: [], warnings: [] }

  if (resolvedMode === 'email') {
    const parsed = parseEmailHeaders(value)
    const summary = summarizeEmailHeaders(parsed)
    const warnings = []
    if (!parsed.headers.from?.length) warnings.push('No From header detected.')
    if (!parsed.headers.to?.length) warnings.push('No To header detected.')
    if (!parsed.headers['message-id']?.length) warnings.push('No Message-ID header detected.')

    const records = [previewRecord(0, 'email', value, summary || 'Raw email source', sourceLabel)]
    if (parsed.body.trim()) {
      records.push(previewRecord(
        1,
        'message',
        parsed.body,
        'Convenience body view derived from the raw email source. Select only if a separate record is useful.',
        sourceLabel,
        { selected: false },
      ))
    }
    return { mode: resolvedMode, records, warnings, metadata: { email: parsed } }
  }

  if (resolvedMode === 'transcript') {
    const rows = parseTranscript(value)
    const records = rows.map((row, index) => previewRecord(
      index,
      'message',
      row.text,
      [row.speaker && `Speaker: ${row.speaker}`, row.timestamp && `Time: ${row.timestamp}`].filter(Boolean).join(' · '),
      sourceLabel,
    ))
    return {
      mode: resolvedMode,
      records,
      warnings: rows.length >= MAX_PREVIEW_ITEMS ? [`Preview capped at ${MAX_PREVIEW_ITEMS} transcript records.`] : [],
    }
  }

  const blocks = splitBulkText(value)
  const records = blocks.map((block, index) => previewRecord(index, suggestEvidenceKind(block), block, 'Bulk text intake.', sourceLabel))
  return {
    mode: resolvedMode,
    records,
    warnings: blocks.length >= MAX_PREVIEW_ITEMS ? [`Preview capped at ${MAX_PREVIEW_ITEMS} records.`] : [],
  }
}

const PROFILE_CONFIG = {
  victim: {
    title: 'Victim Copy',
    evidenceKinds: null,
    entityTypes: ['phone', 'email', 'url', 'domain', 'payment-handle', 'remote-access-id'],
    includeAnalystLinks: false,
    includeCaseNotes: true,
    caveat: 'For the victim or trusted helper. This is an evidence summary, not legal advice or a finding of wrongdoing.',
  },
  bank: {
    title: 'Bank / Fraud Department',
    evidenceKinds: ['payment', 'wallet', 'message', 'email', 'phone', 'url', 'remote-access', 'note', 'file'],
    entityTypes: ['phone', 'email', 'url', 'domain', 'crypto-wallet', 'payment-handle', 'remote-access-id'],
    includeAnalystLinks: false,
    includeCaseNotes: true,
    caveat: 'Prepared for fraud review. Correlations and extracted entities remain investigative aids, not proof.',
  },
  platform: {
    title: 'Platform Abuse Report',
    evidenceKinds: ['message', 'email', 'phone', 'url', 'domain', 'remote-access', 'file', 'note'],
    entityTypes: ['phone', 'email', 'url', 'domain', 'ip', 'payment-handle', 'remote-access-id'],
    includeAnalystLinks: false,
    includeCaseNotes: false,
    caveat: 'Prepared for platform abuse review. It preserves source references and does not assert identity beyond the supplied evidence.',
  },
  law: {
    title: 'Law-Enforcement / Investigator Packet',
    evidenceKinds: null,
    entityTypes: null,
    includeAnalystLinks: true,
    includeCaseNotes: true,
    caveat: 'Full local investigative handoff. Derived intelligence is explicitly non-authoritative and should be independently verified.',
  },
}

export function buildHandoffPacket({ item, profile = 'law', entities = [], crossCaseMatches = [], appVersion = 'unknown' } = {}) {
  if (!item) throw new Error('A case is required to build a handoff packet.')
  const config = PROFILE_CONFIG[profile] || PROFILE_CONFIG.law
  const evidence = (item.evidence || []).filter((record) => !config.evidenceKinds || config.evidenceKinds.includes(record.kind))
  const filteredEntities = entities.filter((entity) => !config.entityTypes || config.entityTypes.includes(entity.type))

  return {
    schema: 'scamalax.handoff.v1',
    profile,
    profileTitle: config.title,
    generatedAt: new Date().toISOString(),
    appVersion,
    caveat: config.caveat,
    case: {
      id: item.id,
      title: item.title,
      victimAlias: item.victimAlias || '',
      type: item.type || '',
      status: item.status,
      createdAt: item.createdAt,
      ...(item.incidentDate ? { incidentDate: item.incidentDate } : {}),
      ...(item.reportedLoss ? { reportedLoss: item.reportedLoss } : {}),
      notes: config.includeCaseNotes ? (item.notes || '') : '',
    },
    evidence,
    timeline: item.timeline || [],
    derivedIntelligence: {
      authority: 'NON_AUTHORITATIVE',
      entities: filteredEntities,
      crossCaseMatches: profile === 'law' ? crossCaseMatches : [],
      analystLinks: config.includeAnalystLinks ? (item.analystLinks || []) : [],
    },
  }
}

export function evidenceValueMarkdown(record, prefix = '- Value: ') {
  if (!record.contact) return [prefix + record.value]
  // User-entered contact text stays literal in rendered Markdown, including
  // suspicious URLs and markup. A longer fence also contains pasted fences.
  const value = String(record.value || '')
  const runs = value.match(/~+/g) || []
  const fence = '~'.repeat(Math.max(3, ...runs.map((run) => run.length + 1)))
  return ['- User-entered contact text:', '', fence + 'text', value, fence, '']
}

export function handoffToMarkdown(packet) {
  const lines = [
    '# SCAM-A-LAX Handoff Packet',
    '',
    `**Profile:** ${packet.profileTitle}`,
    `**Case:** ${packet.case.title}`,
    `**Case ID:** ${packet.case.id}`,
    `**Status:** ${packet.case.status}`,
    `**Generated:** ${packet.generatedAt}`,
    '',
    `> ${packet.caveat}`,
    '',
    '## Case summary',
    '',
    `- Victim alias: ${packet.case.victimAlias || 'Not provided'}`,
    `- Scam type: ${packet.case.type || 'Unknown'}`,
    `- Created: ${packet.case.createdAt}`,
  ]

  if (packet.case.notes) lines.push(`- Notes: ${packet.case.notes}`)
  if (packet.case.incidentDate) lines.push(`- Incident date (user supplied): ${packet.case.incidentDate}`)
  if (packet.case.reportedLoss) lines.push(`- Approximate loss (user supplied): ${packet.case.reportedLoss.amount} ${packet.case.reportedLoss.currency}`)

  lines.push('', '## Evidence manifest', '')
  if (!packet.evidence.length) lines.push('_No evidence records selected for this profile._')
  packet.evidence.forEach((record, index) => {
    lines.push(`### ${index + 1}. ${String(record.kind || 'evidence').toUpperCase()} — ${record.state || 'UNKNOWN'}`)
    lines.push(`- Evidence ID: ${record.id}`)
    lines.push(`- ${record.contact ? 'Note saved at' : 'Recorded'}: ${record.recordedAt}`)
    if (record.contact) lines.push(`- Contact format: ${record.contact.schema}`)
    if (record.relatedContactId) lines.push(`- Attachment for contact record: ${record.relatedContactId}`)
    if (record.sourceType === 'USER_STATEMENT') lines.push('- Source: User statement, not independently verified')
    if (record.correctsRecordId) lines.push(`- Clarifies record: ${record.correctsRecordId} (original retained)`)
    if (record.sha256) lines.push(`- SHA-256: \`${record.sha256}\``)
    if (record.fileName) lines.push(`- File: ${record.fileName} (${record.fileSize || 0} bytes)`)
    if (record.value) lines.push(...evidenceValueMarkdown(record))
    if (record.note) lines.push(`- Note: ${record.note}`)
    lines.push('')
  })

  lines.push('## Timeline', '')
  if (!packet.timeline.length) lines.push('_No timeline events._')
  packet.timeline.forEach((event) => lines.push(`- **${event.at}** — ${event.text}`))

  lines.push('', '## Derived intelligence', '', '**Authority: NON_AUTHORITATIVE**', '')
  if (!packet.derivedIntelligence.entities.length) lines.push('_No entities included for this profile._')
  packet.derivedIntelligence.entities.forEach((entity) => {
    lines.push(`- ${entity.type}: ${entity.value} — ${entity.sourceIds?.length || 0} source record(s)`)
  })

  if (packet.derivedIntelligence.crossCaseMatches.length) {
    lines.push('', '### Cross-case correlations', '')
    packet.derivedIntelligence.crossCaseMatches.forEach((match) => {
      lines.push(`- ${match.type}: ${match.value} — ${match.cases.map((entry) => entry.title).join(', ')}`)
    })
  }

  if (packet.derivedIntelligence.analystLinks.length) {
    lines.push('', '### Analyst links', '')
    packet.derivedIntelligence.analystLinks.forEach((link) => {
      lines.push(`- ${link.state}: ${link.from} --${link.relation}--> ${link.to}${link.note ? ` — ${link.note}` : ''}`)
    })
  }

  return lines.join('\n')
}

export const HANDOFF_PROFILES = Object.entries(PROFILE_CONFIG).map(([id, config]) => ({ id, title: config.title }))
