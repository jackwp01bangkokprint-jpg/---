# Security Specifications & Data Invariants for WP-WRT Vehicle Log

## Data Invariants
1. **Authenticated Users Only**: Only users authenticated via Google/Gmail with a verified email can perform operations.
2. **Identity Integrity**: Users can only create or edit logs where the `userEmail` strictly matches their authenticated `request.auth.token.email`.
3. **Valid IDs**: All document IDs and car IDs must conform to strict alpha-numeric formatting with reasonable size bounds to prevent resource-exhaustion or injection attacks.
4. **State Transition Integrity**: A vehicle log cannot go from `returned` back to `active`. The state transition is unidirectional: `active` -> `returned`.
5. **No Deletions**: Once a log is created, clients are strictly forbidden from deleting it to preserve audit logs.
6. **No Spurious Fields**: Document updates are strictly constrained using `affectedKeys().hasOnly()` to prevent "Shadow Update" injections of un-whitelisted attributes.
7. **Strict Field Typing**: Values (like battery level, mileage) must conform to strict types (e.g. `battery` between 0 and 100, `mileage` >= 0) and timestamps must utilize `request.time` (server-side timestamps).

---

## The "Dirty Dozen" Payloads
These payloads attempt to breach security or corrupt data, and must be rejected by Firestore Security Rules:

1. **Spoofed User Creation**: Attempt to create a log for user `alice@example.com` while authenticated as `bob@example.com`.
2. **Anonymous Create**: Attempt to log a checkout without being authenticated.
3. **Unverified Email Create**: Attempt to write a log when the email in `request.auth.token.email_verified` is `false`.
4. **Log Deletion**: Attempting to delete an existing log to erase a record of vehicle damage or misuse.
5. **Arbitrary Status Reversal**: Attempt to update a `returned` vehicle log back to `active` status.
6. **Shadow Update Gatecrasher**: Updating a log to inject a field like `isAdmin: true` or `verified: true` in the root of the document.
7. **Client-Controlled Timestamp**: Creating a log with a fake `createdAt` timestamp in the past to skew metrics.
8. **Out-of-Bound Battery Level**: Creating a log with checkout battery set to `150` or `-50`.
9. **Negative Mileage**: Setting checkout mileage to `-999`.
10. **Huge ID Resource Poisoning**: Creating a log with a document ID that is 1MB in size to deplete storage/memory.
11. **Altering Immutable Checkout**: Updating a log to change the original `checkout.mileage` or `checkout.battery` after it has been saved.
12. **Bypassing Return Check**: Attempting to complete a return with empty return parameters or missing returned state fields.
