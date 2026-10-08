# SCAM-A-LAX architecture

## Active application

`main.jsx` mounts `AppEdition.jsx`: the overview, guide, message check, Easy Scam Radar, help, Academy, Number Tracker and My cases. Easy Scam Radar lazily mounts `GuidedScamRadar.jsx`; My cases lazily mounts `AppV3.jsx`, exposing `AppV2.jsx` and Evidence Intake. Original `App.jsx` is retained legacy source, not the active entry point. Beginner and advanced tools share the existing workspace.

## Storage and trust

Case/evidence text, metadata, timelines and analyst links use localStorage `scamalax.state.v1`. `workspace-storage.js` reads the current saved workspace before each synchronous update. Unreadable containers are refused; failed writes keep inputs and do not replace saved data.

Optional PNG/JPG/WebP copies use IndexedDB `scamalax.screenshots.v1`, store `images`. `screenshots.js` validates original bytes and image decoding, retains the original Blob/hash, and exports referenced images. A save waits for the image before adding its record; a failed case write rolls back that staged image. Other files and advanced intake keep receipts only. Nothing is uploaded.

The two stores have no shared crash-proof transaction. Runtime rollback paths are tested, but abrupt interruption can leave an unreferenced image. Keep originals and JSON backups. Delete all local data clears cases and the screenshot store after confirmation.

Browser storage is unencrypted and accessible to the same browser profile. No sign-in, remote database, public caller identity or paid dependency is required. Learning/checklists use separate `scamalax.learning.v1`. Standalone checked messages and helper questions remain in memory.

## Case workflow and history

`NewCaseForm.jsx` provides Story → Supporting details → Review and save. `case-workflow.js` validates fields, hashes supplied material and saves the case plus records with one workspace write. Existing cases/records remain. Optional names are generated at save time; IDs use `crypto.randomUUID()`.

Incident context adds optional `incidentDate` and `reportedLoss` to existing cases. Loss is a decimal string with currency USD and `approximate: true`; unknown and zero differ. User statements add `sourceType: USER_STATEMENT`. A clarification appends `correctsRecordId`, retaining the original text/hash/state/image. These are additive fields, not a storage migration.

AppEdition owns guided drafts/selected File objects in tab memory, preserving them across app navigation. Refresh/close warns; a confirmed refresh loses the draft. Ledger, clarification and intake drafts ask before leaving their surface. Save reads fresh data, and intake refuses a deleted target. Local case search/filter/sort does not mutate records or provide external reputation results.

## Evidence semantics

OBSERVED means directly supplied/seen material, not verified claims. SUPPORTED means independent support. CORRELATED means an association, not identity. INFERRED is analysis, DISPUTED marks disagreement, and UNKNOWN marks insufficient basis. New statements are visibly unverified. Automated analysis never promotes an inference/correlation into direct evidence; case ScamCheck is explicitly saved as INFERRED.

## Existing shared modules

- Scam Ledger: immutable records, receipts, screenshot viewer, timelines and explicit clarification.
- Evidence Intake: reviewable email/transcript/bulk/file proposals with analyst-selected kind/state before commit; failed writes retain source/preview/files.
- ScamCheck/Radar: shared deterministic rules and configured warning points; no matches remain Unknown, safety unverified. Editing clears stale results. No automatic URL visits or OCR.
- Easy Scam Radar: sixteen plain-language questions with configured, capped warning points and a live needle. Answers exist only while its page is open, do not become case evidence, and never enter browser storage or a remote service. Its phone view keeps a compact gauge visible while answering; case drafts remain in AppEdition and survive radar navigation.
- Number Tracker: conservative matching of local phone evidence, no public scam database or caller identity/location.
- Intelligence Graph: entity extraction, cautious cross-case correlations, labeled analyst links.
- Helper: built-in directions with deliberate navigation, not remote AI.
- Help/Victim Rescue: checklists and user-selected official links, no automatic reporting or recovery promises.
- Academy: twenty fictional scenarios, answer explanations and local progress.
- Case Packet/Handoff: JSON/Markdown, incident context, statement/clarification labels, original evidence and non-authoritative derived intelligence. Image-inclusive JSON retains original bytes.

## Backup, deployment and follow-on work

Workspace backups export cases and referenced screenshots. Full restoration is still open PR #2, predating screenshot support; it needs integration and actual IndexedDB restoration before claiming a complete image-inclusive restore.

Build Check runs unit tests, production build and browser QA on pull requests. Deploy GitHub Pages builds/publishes dist after approved main changes. Pages Source must be GitHub Actions to avoid competing branch/Jekyll publishing. This feature branch does not publish production.
