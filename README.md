# SCAM-A-LAX

**Larrina’s Edition — Scam Awareness, Support & Evidence**

> Flush scams. Preserve evidence. Map the mess.

SCAM-A-LAX is a free, open-source, local-first toolkit for organizing scam reports, preserving evidence metadata, triaging suspicious messages, mapping identifiers, correlating local cases, and producing clean case packets for victims, banks, platforms, investigators, and law-enforcement handoff.

Current build: **v0.8.0-alpha — Larrina’s Edition**

This fork adds a people-first front door to Mikey’s local evidence workstation. Begin with **Check a message**, **Get help**, or **Scam Academy**; use **My cases** when you want to preserve and export a record. Existing `scamalax.state.v1` case data and evidence semantics are retained.

![Larrina’s Edition overview with message checks, response steps, local cases, and Scam Academy](docs/larrinas-edition-overview.png)

### New in this edition

- A responsive overview with plain-language navigation and direct help paths.
- Standalone message screening that needs no case. Every matched rule includes the matched words, an explanation, and a next step. No matches leave safety **unverified**. Checks do not open pasted links, save the message, or upload it.
- A situation-based response checklist for payments, exposed accounts, and device access, with deliberate links to official U.S. reporting resources.
- Twenty fictional Scam Academy scenarios across four topics, including expected activity and situations that need independent verification. Each choice gets an explanation; practice progress is saved locally.
- One shared screening engine for standalone checks and case-based ScamCheck. Case analysis continues to be recorded only as `INFERRED`.
- Safe workspace restore with a case preview, individual selection, duplicate skipping, and separate copies for changed versions. Damaged saved data is protected; failed saves are reported without claiming success.

Message text in the standalone checker is held only while that page is open. Navigating away discards it; opening My cases does not automatically create evidence. Learning answers, selected help situations, and checklist ticks use the separate `scamalax.learning.v1` key. They contain no pasted messages or case records. Browser storage is not encrypted and is not a shared or cloud backup.

Support and awareness content references FTC consumer guidance, reviewed October 7, 2026:

- [What to do if you were scammed](https://consumer.ftc.gov/articles/what-do-if-you-were-scammed)
- [How to avoid a scam](https://consumer.ftc.gov/articles/how-avoid-scam)
- [Job scams](https://consumer.ftc.gov/articles/job-scams)
- [Refund and recovery scams](https://consumer.ftc.gov/articles/refund-and-recovery-scams)

The Academy examples are original fictional exercises, not real incident reports. This app cannot verify identity, guarantee detection, recover funds, or confirm that an account or device is secure.

## Core principles

- **Defensive only.** No credential theft, malware, unauthorized access, retaliation, doxxing, or destructive tooling.
- **Evidence before inference.** Observations, correlations, and hypotheses remain visibly distinct.
- **Preview before commit.** Bulk intake proposes records first; the analyst chooses what actually enters a case.
- **Local first.** Case data stays in the browser unless the user deliberately exports it.
- **Human authority.** Automated parsing can structure evidence; it cannot declare guilt or silently upgrade evidence state.
- **Derived intelligence has no authority of its own.** Entity extraction and graph edges remain traceable to evidence or explicit analyst hypotheses.
- **Original evidence stays original.** File evidence is hashed in-browser and recorded without altering or uploading the source file.

## Current modules

- **Evidence Intake** — preview-first intake for raw email, transcripts, bulk indicators, screenshots, and other files.
- **Email Header Parser** — preserves selected standard headers, repeated `Received` hops, message IDs, and the raw source for review.
- **Transcript Intake** — separates timestamped/speaker-labeled call or chat transcripts into reviewable records.
- **Batch File Hashing** — stages multiple files or screenshots and creates SHA-256 receipts without storing file bytes.
- **Handoff Profiles** — purpose-built Victim, Bank/Fraud, Platform Abuse, and Law-Enforcement/Investigator exports.
- **Scam Ledger** — case timeline, evidence records, confidence states, SHA-256 receipts.
- **Intelligence Graph** — deterministic local extraction of phones, emails, URLs, domains, IPs, crypto wallets, payment handles, and remote-access IDs.
- **Cross-Case Correlation** — highlights repeated useful identifiers across local cases while suppressing generic service domains.
- **Analyst Links** — explicit, state-labeled hypotheses between extracted entities.
- **ScamCheck** — local heuristic screening for common scam indicators.
- **Victim Rescue** — immediate-response checklist for active scam situations.
- **Case Packet v2** — Markdown and JSON exports containing evidence plus clearly marked non-authoritative derived intelligence.
- **Workspace Backup & Restore** — portable JSON backup, preview, and selected restore of local cases.

**Scam Academy** is now available in this edition. **ScamWatch** remains a future module.

## Backup and restore

In **My cases**, choose **Backup workspace** to download a `scamalax.workspace.v1` JSON backup. To move or recover cases, choose **Restore backup**, select the file, review the preview, and confirm the cases you want to add. Previewing or canceling does not save anything. Restore accepts workspace backups up to 10 MB, with a combined limit of 1,000 cases and 50,000 evidence, timeline, and analyst-link records. Individual case packets use a different schema and are not accepted.

Existing cases are kept. An exact duplicate is skipped; a different version with the same case ID receives a new ID and a **restored copy** label. Restore preserves evidence states, timestamps, notes, file metadata, SHA-256 receipts, and analyst links. It reads the latest saved workspace at confirmation so edits made in another tab are included. Ordinary edits reject a stale workspace rather than overwrite another tab's changes; reload My cases to continue.

Backups contain private case text as unencrypted JSON. Keep them securely and keep original attachments separately: the app saves file hash receipts, not file bytes. Workspace backups do not include Academy or help-checklist progress. If saved case data is damaged, the app leaves it untouched and offers **Download saved data** before you decide whether to clear it. Storage access or quota failures show an error and leave the previous saved cases in place.

## Evidence Intake semantics

Evidence Intake is a staging layer. Pasted material is parsed into **proposed records**, not automatically written to the case. The analyst can include/exclude each record and change its kind or evidence state before committing.

Files and screenshots are read locally to calculate SHA-256 receipts. SCAM-A-LAX stores the receipt plus file metadata, not the original bytes. v0.6 does **not** claim OCR or image interpretation.

Raw email intake preserves the submitted source as the canonical email evidence. Header parsing and body extraction are convenience views over that source and do not increase epistemic authority.

## Handoff profiles

Handoff profiles filter presentation for a particular audience without mutating the underlying case:

- **Victim Copy** — readable evidence/timeline summary for the victim or trusted helper.
- **Bank / Fraud Department** — payment-oriented records and relevant identifiers.
- **Platform Abuse Report** — account/contact/URL/domain/remote-access indicators and source references.
- **Law-Enforcement / Investigator Packet** — full evidence, derived entity index, cross-case correlations, and explicit analyst links.

Every handoff that includes extracted entities labels them **NON_AUTHORITATIVE**. A tailored export is not a verdict, legal filing, or independent verification.

## Evidence states

`OBSERVED` · `SUPPORTED` · `CORRELATED` · `INFERRED` · `DISPUTED` · `UNKNOWN`

These labels are intentionally conservative. A correlation is not proof, an inference is not evidence, and software is not a judge.

## Intelligence semantics

The Intelligence Graph is a **derived view**. Extracted entities are recomputed from case evidence rather than silently becoming new evidence records. Cross-case matches mean only that the same normalized identifier occurs in more than one local case. Analyst-authored links carry an explicit evidence state and remain visibly distinct from extraction edges.

Generic providers such as Gmail, Outlook, Yahoo, iCloud, and similar common domains are suppressed from cross-case matching to reduce meaningless correlations.

## Development

```bash
npm ci
npm test
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

Desktop/mobile browser QA against the production build:

```bash
npx playwright install chromium
npm run test:browser
```

The browser suite verifies message privacy, result invalidation, checklist and lesson persistence, all 20 practice scenarios, legacy case preservation, exports, preview-before-commit intake, inferred-only case analysis, backup preview/cancel, selected restore, collision copies, duplicate reimports, concurrent edits, damaged data, and storage failures. It also restores a downloaded backup into an empty browser workspace. Screenshots are written to the ignored `test-results/` folder. For an already-running preview set `QA_BASE_URL`; for a managed Chromium installation set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## GitHub Pages

The repository includes GitHub Actions workflows for tests/build validation and Vite deployment to GitHub Pages.

## Safety boundary

SCAM-A-LAX is intended for defensive evidence organization, victim support, authorized investigation, and scam-awareness work. Do not use it for unauthorized access, credential collection, malware delivery, retaliation, doxxing, or harassment.

## License

MIT. Build useful things. Protect people. Don't become the problem you're trying to solve.
