# v0.7.0-alpha — Larrina’s Edition

This edition makes SCAM-A-LAX approachable before a user creates a case, while preserving Mikey’s original evidence workflow and MIT license.

## User flows

- Overview → Check a message: local, explainable pattern matches and practical next steps. Input is not persisted, links are not fetched, and editing clears stale findings.
- Overview → Get help: situation-based containment checklist with local progress and official reporting links.
- Overview → Scam Academy: 20 original synthetic scenarios across messages/accounts, money/shopping, jobs/opportunities, and people/impersonation. Progress survives reloads.
- My cases → existing ledger, graph, intake, exports, and handoff profiles. Existing case storage remains compatible; derived intelligence stays non-authoritative.

## Implementation

The new entry point is `AppEdition.jsx`; the existing evidence workstation loads on demand. `scamcheck.js` supplies the shared deterministic rules and `academy.js` contains the educational scenarios and response steps. A shared version constant keeps case and handoff exports consistent. A lockfile makes builds reproducible.

No backend, account system, message upload, live reputation lookup, or automatic reporting is introduced. Original file bytes remain outside case storage and exports. Local case storage is not encrypted. The browser QA fixtures contain synthetic data only.

## Validation

Run `npm ci`, `npm test`, and `npm run test:browser`. The browser suite builds the production app, starts a local preview when needed, exercises desktop/mobile flows, and fails on browser errors or unexpected requests to another origin.

Support resources were checked against FTC guidance on October 7, 2026. Screening is a review aid, not proof or a safety guarantee. Recovery of money is not guaranteed.
