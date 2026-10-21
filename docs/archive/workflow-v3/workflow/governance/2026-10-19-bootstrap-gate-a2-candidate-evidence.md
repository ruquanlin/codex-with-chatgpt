# Workflow v3 — Governance Bootstrap Gate A-2: Candidate Provenance & Approval Evidence

**Date:** 2026-10-19  
**Mode:** Read-only evidence preparation; no implementation, installation, or execution approval  
**Current disposition:** **NO ELIGIBLE INSTALLATION CANDIDATE — BLOCKED**

## Grounded source observations

- Verified C2C workspace: `codex-with-chatgpt`, ID `51442efa88b2`, branch `main`, HEAD `4153074`, dirty working tree.
- Local source has macOS LaunchAgent autostart code (`src/autostart/macos.ts`), but this is **not** the dedicated Governance Bootstrap trust installer.
- Search of the connected workspace found no dedicated Bootstrap installer, Secure Enclave Owner key enrollment module, signed candidate binary, or installation receipt.
- GitHub REST release list for `ruquanlin/codex-with-chatgpt` returned `[]` on 2026-10-19; this does **not** rule out unpublished local or external artifacts. Reference: https://github.com/ruquanlin/codex-with-chatgpt/releases
- Governing draft: `docs/superpowers/specs/2026-10-19-governance-bootstrap-policy-amendment-v1.md` — *pending formal governance approval*.
- Gate A preliminary record already placed at `docs/workflow/governance/Workflow_v3_Governance_Bootstrap_Gate_A_Readiness_2026-10-19.md`.

## Candidate evidence ledger (not approvals)

| Required item | Current evidence / status |
|---|---|
| Fixed candidate source commit + reviewed tree | **Absent**; current dirty tree cannot serve as a frozen release |
| Exact installer/application artifact and digest | **Absent** |
| Publisher signing identity and independently trusted verification anchor | **Absent** |
| macOS code-signing / notarization evidence for the actual artifact | **Absent** |
| Exact installation file, permission, and privilege manifest | **Absent** |
| Independent reviewer identity, dated findings and reviewed digest | **Absent** |
| Hardware-protected Owner key, public-key enrollment and confirmed user-presence behavior | **Absent** |
| Formal governance policy approval | **Absent** |
| Separate authenticated initial-install authorization | **Absent** |
| Verified default-disabled state and post-install receipt | **Not testable before approved installation** |

## Narrow candidate boundary to apply when one exists

The candidate must be the initial **local trust-establishment component only**, as described in the existing Governance Bootstrap amendment. The frozen review packet must name its version, files, permissions, signing identity, trusted verification reference, rollback path and precise installation actions.

Installation must neither run Codex nor enter Phase 2/3, issue authorization credentials, change Jev decisions, modify historical Stop records, or activate a standing bypass. The installed component must remain `VERIFIED_DISABLED` until separately authorized; the authorization mechanism must prove deliberate, independently enforced Owner interaction for each proposal-bound approval.

Apple Secure Enclave / Keychain / LocalAuthentication are OS security capabilities, **not** an existing Bootstrap product or a source-provenance substitute. Code signing and notarization help establish publisher/integrity and automated checks, but do not constitute independent security approval.

## Gate A-2 handoff requirements (separate evidence channels)

1. **Publisher/source provenance:** one immutable source revision and corresponding artifact; independently anchored publisher identity, signature and digest.
2. **Independent technical review:** a reviewer separate from the implementer examines exactly that revision/artifact and signs dated findings tied to the digest, including privilege separation, prompt/user-confirmation behavior, authentication reuse, fail-closed behavior, and installation side effects.
3. **Governance and installation approval:** records from an independently authenticated Owner/authority; policy approval and initial-install authorization are separate acts. A chat acknowledgment is not either record.
4. **Release freeze and install go/no-go:** verify the identical artifact/version against all three evidence categories before any local installation; no approval to execute Task 3 is implied.

## Decision

**Gate A-2 cannot yet freeze an installation candidate because no candidate release exists.** The next legitimate work is to produce a fixed, independently verifiable candidate and its evidence **through an explicitly authorized route**, not to invoke Codex Cloud as a substitute for C2C approval. No code was changed, no Jev call was repeated, and no C2C execution handoff was attempted during this evidence preparation.

**Primary Apple sources:**
- https://developer.apple.com/documentation/security/secaccesscontrolcreateflags/privatekeyusage
- https://developer.apple.com/documentation/localauthentication/lacontext/touchidauthenticationallowablereuseduration
- https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
