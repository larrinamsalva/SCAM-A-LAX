# Guided case saving — review candidate

The first implementation pass from the upgrade brief is based on main `14eb714061fcf3f82c47b590df669d3b63b32be1`. It completes the case-saving/retrieval priority within the existing application. Production publication requires the owner's approval.

Previously, New case saved an empty folder, requiring a separate story save in Scam Ledger. Now Save a new case gathers the story, optional context/contact details/attachment, and a review, then saves the folder and first records together. The result shows a lasting confirmation, visible unique ID, and saved story. An advanced folder-only action remains explicit.

New capabilities:

- Optional case name, category, incident date, approximate USD loss, and contact details; unknown loss and zero remain distinct.
- Original-byte screenshot copies or file receipts in the guided flow, with validation and rollback on failed case writes.
- In-memory drafts retained across navigation/helper use, review edits, and deliberate discard confirmation.
- Search by story, names/IDs, contacts, record IDs and filenames, with status filtering, sorting and honest no-match states.
- Clarifications as linked new user statements; original records/hashes/images/states are retained.
- User-statement labels and incident context in case JSON/Markdown and all handoff profiles.
- Unsaved-change protection for ledger/module navigation, clarifications, intake, and refresh/close.
- Advanced intake uses fresh saved data, retains newer cases/records, refuses deleted targets, and keeps its preview on failure.
- Mobile saved records use the page scroll; updated guide, helper, architecture, audit and regression tests.

Validation: the baseline passed 40 unit tests, build and browser QA. The candidate passed 52 unit tests, production build, and full existing/new desktop/mobile browser QA, including failure paths. Asserted flows reported zero application errors and unexpected external requests. Real screenshots and the complete delivery report are in [the audit](UPGRADE_AUDIT.md).

Browser storage remains local and unencrypted. Drafts do not survive a confirmed refresh. Keep originals and JSON backups. Runtime image rollback is tested; the two browser stores do not share a crash-proof transaction and abrupt shutdown may leave an unreferenced image.

Backup restore is still open PR #2 and needs image-inclusive compatibility work. OCR, PDF/redaction UI, external reputation services, expanded education, and a full visual redesign are not part of this pass. The helper remains built-in directions.

Before a production merge, confirm Pages Source is GitHub Actions. Next proposed pass: reconcile PR #2 and complete validated case-and-image restoration, then unify the beginner dashboard/mobile navigation in a separate reviewable stage.
