# Workflow v3 — Governance Bootstrap Initial Trust Gate A

**Read-only preliminary review & installation readiness record**  
**Date:** 2026-10-19  
**Repository / Workspace:** `codex-with-chatgpt` / `codex-with-chatgpt` (`workspaceId: 51442efa88b2`)  
**Observed branch / commit:** `main` / `4153074` (dirty; not a release artifact)  
**Decision:** `BLOCKED — NOT APPROVED FOR INSTALLATION`  
**Jev:** Preserve the most recent `REFRAME`. No Jev invocation during this review.  
**Limit:** This preliminary review is not a third-party audit, Owner identity attestation, formal policy approval, or permission to execute Codex.

## Scope and existing evidence

- Retain Task 1 (Phase 2 fail-closed) and Task 2 (server-side Jev Receipt issuance / Stop persistence) exactly as found. The working tree has uncommitted changes.
- Task 3 (Phase 2 verification and authorized Execution Brief / Handoff Proof) has **not** been implemented or authorized.
- Governing proposal: `docs/superpowers/specs/2026-10-19-governance-bootstrap-policy-amendment-v1.md`, status **Final Design Draft — Pending Formal Governance Approval**.
- The current Jev Receipt store (`src/workflow/phase2/jev-receipts.ts`) relies on a local HMAC issuer key; it is **not** an enrolled hardware-protected Owner signing key or trusted Bootstrap installer.
- Workspace search identified no Bootstrap installer, signed fixed installation release, Owner key-enrollment component, or verified installation receipt. Absence from the inspected workspace is not proof that no external artifact exists.

## Gate A evidence review

| Gate A criterion | Required observable evidence | Current finding |
|---|---|---|
| Independent policy/install approval | Formal policy approval and distinct, authenticated local installation approval | Missing; design itself is pending approval |
| Trusted installation provenance | Independently reviewed frozen source revision, signed or independently pinned distributable artifact, out-of-band trust anchor, exact version | Missing |
| Minimal installation scope | Explicit file/permission manifest, signer identity, no unrelated writes, no Codex/Phase 2/Phase 3 execution | Not specified as a verifiable release manifest |
| Hardware-protected Owner private key | Proof of creation on supported device, nonexportability, public-key enrollment anchored to trusted installer | No implementation or attestation |
| Fresh, independent Owner interaction | Approved Proposal and scope shown by trusted local component; authentication enforced for each approval; silent requests/reuse rejected | No implementation or tests |
| Privilege separation / default disable | Independent installer vs Owner approval vs C2C execution permissions; installed state `VERIFIED_DISABLED` | Design requirement only, not demonstrated |

**Result:** No criterion is evidenced at runtime; Gate A remains blocked. No installation, key enrollment, signing, release publication, or governance activation was performed.

## Independent review package — prepare without installing

1. **Freeze one candidate release:** specify source commit/tag, build method, exact binaries/files, dependencies, entitlements, install locations, access permissions, rollback/removal procedure, and a scope manifest. Do not treat the dirty current working tree as a reviewed release.
2. **Provide independent artifact authenticity:** name the publisher and pre-established trust anchor; verify signer identity and artifact hash against an independently trusted reference. A hash included with the artifact or distributed by the same untrusted channel cannot establish authenticity by itself.
3. **Request external security sign-off:** have a reviewer separate from the implementer assess the frozen source/artifact, install privileges, keychain access controls, release provenance, and the inability of C2C/Codex to authorize itself. Retain the reviewer's identity, signature, date, findings, and reviewed digest.
4. **Demonstrate Owner authentication on the actual Mac:** verify Secure Enclave support; use a nonexportable hardware-protected P-256 signing key and a purpose-bound Keychain access policy (e.g. private-key usage plus independently enforced user-presence authentication). Bind the public key to the Owner through the approved installation procedure. No automatic fallback to an exportable software key.
5. **Prove per-approval intent:** the trusted local confirmation interface must display the exact Workspace, Proposal, scope digest, original Stop reference, expiration, and any permitted validation/deployment before requiring fresh explicit interaction. Demonstrate that silent requests, cancelled interaction, replay, mismatched payloads, and authentication-context reuse cannot authorize another approval. Hardware authentication alone does not prove informed intent.
6. **Document non-execution installation:** installation must leave the component inert (`VERIFIED_DISABLED`), must not generate execution credentials, must not call Codex/Phase 2/Phase 3, and must not mutate historical Jev Stop or previous E2E records. Record the installed artifact digest, signer, reviewer approval, file manifest, key-enrollment reference, local Owner confirmation, and disabled status.

## Required approval / receipt fields (blank until proven)

| Evidence item | Value |
|---|---|
| Policy Approval authority, date and verifiable record | **Not supplied** |
| Separate initial-install authorization and authenticated approver | **Not supplied** |
| Reviewer identity and signed review record | **Not supplied** |
| Reviewed source revision + build artifact digest | **Not supplied** |
| Independent publisher identity / trust anchor | **Not supplied** |
| Binary or installer signing / verification evidence | **Not supplied** |
| Install paths, privileges, entitlements and file manifest | **Not supplied** |
| Device support + Secure Enclave proof | **Not supplied** |
| Public key enrollment proof + Owner key reference | **Not supplied** |
| Fresh per-approval interaction and negative test evidence | **Not supplied** |
| Disabled post-install state and local audit receipt | **Not supplied** |

## Release / stop boundary

- **Now permitted:** offline review, comparison to authoritative macOS API documentation, compiling the review package, and obtaining independent approval evidence.
- **Not permitted:** installing a candidate, enrolling/using an Owner approval key for this workflow, activating Bootstrap, issuing credentials or Handoff Proof, executing Task 3, or presenting ChatGPT conversation approval as formal authority.
- **Do not revisit:** historical Jev Stop, latest `REFRAME`, previous E2E outcomes, or unrelated code.
- **Only after** independent policy approval, trusted source/release verification, independent install authorization, and Owner authentication are proven should a controlled installation procedure be submitted for a separate go/no-go decision. Even a successful Gate A installation does not by itself authorize Task 3 or bypass Phase 2/3.

## Primary technical references

- Apple: [Protecting keys with the Secure Enclave / kSecAttrTokenIDSecureEnclave](https://developer.apple.com/documentation/security/ksecattrtokenidsecureenclave?language=swift).
- Apple: [SecAccessControlCreateFlags — user presence and private key usage](https://developer.apple.com/documentation/security/secaccesscontrolcreateflags).
- Apple: [LocalAuthentication / LAContext](https://developer.apple.com/documentation/localauthentication/lacontext).
- Apple: [Touch ID authentication reuse duration](https://developer.apple.com/documentation/localauthentication/lacontext/touchidauthenticationallowablereuseduration).
- Apple: [macOS signing and Gatekeeper](https://developer.apple.com/library/archive/technotes/tn2206/).
- Apple: [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

**Final classification:** Gate A documentation review complete; installation **not ready**; independent formal review/sign-off **not yet obtained**.
