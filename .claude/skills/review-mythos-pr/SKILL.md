---
name: review-mythos-pr
description: Full mythos-sdk PR review workflow — checkout branch, pull changes, fetch Jira DoD, run deep code review, post inline GitHub comments + summary. Use when reviewing a mythos-sdk PR against its Jira ticket definition of done.
arguments: [branch, pr, ticket]
argument-hint: <branch-name> <pr-number> <ticket-number>
disable-model-invocation: true
allowed-tools: Bash(git *) Bash(gh *)
---

## Inputs

- Branch: `$branch`
- PR number: `$pr`
- Jira ticket: `$ticket` — normalize to `MT-$ticket` if the user did not prefix it with `MT-`

Jira URL: `https://mythosplatform.atlassian.net/browse/MT-$ticket`
GitHub repo: `Mythoswork/mythos-sdk`

---

## Step 1 — Checkout & sync

```bash
git fetch origin
git checkout $branch
git pull origin $branch
```

Stop and report to user if checkout fails.

---

## Step 2 — Fetch Jira ticket

Call `mcp__atlassian__getJiraIssue` with the normalized ticket ID (e.g. `MT-293`).

Extract:
- Summary / title
- Full description
- Acceptance criteria / Definition of Done (check description body, custom fields, and any checklist blocks)
- Any sub-tasks or linked issues that must be done

---

## Step 3 — Run PR review

> **SDK language routing:** For the Python codebase SDK, use `/ecc:python-review`. `/mythos-sdk-patterns` is for Node.js only.

Invoke these skills IN ORDER to sharpen the review lens before analysing the diff:

1. **`/mythos-sdk-patterns`** — loads mythos-sdk architecture patterns, API design, database optimisation, and server-side best practices. Every violation becomes a review finding.
2. **`/ecc:multi-mythos-sdk`** — runs a multi-model mythos-sdk pass for APIs, algorithms, data, and business logic. Fold any additional findings into the review.

Then perform a thorough review covering:
- Logic correctness and edge cases
- **Compliance with the engineering constitution (CLAUDE.md)**: typed errors, no `console.*`, no bare `throw new Error()`, service-layer rules, no inline `createClient()`, response envelope shape, money as integer cents, etc.
- **mythos-sdk patterns** (per `/mythos-sdk-patterns`): N+1 query detection, proper transaction boundaries, index usage, pagination correctness
- Security: auth middleware usage, rate limiting, input validation, no secrets in logs
- Test coverage: happy path + at least one negative case for auth/payment flows
- Performance: N+1 queries, missing `Promise.all()`, blocking sync ops

---

## Step 4 — DoD compliance matrix

Cross-reference all review findings against the Jira acceptance criteria. For each DoD item output one of:
- ✅ Satisfied
- ❌ Missing / not implemented
- ⚠️ Partially met — describe what's missing

---

## Step 5 — Post GitHub feedback

Target: PR `$pr` on `Mythoswork/mythos-sdk`.

### Inline comments (preferred)
For each specific file-level finding, submit an inline comment via:

```bash
gh api repos/Mythoswork/mythos-sdk/pulls/$pr/reviews \
  --method POST \
  --input - <<'EOF'
{
  "commit_id": "<head-sha>",
  "body": "<overall-summary>",
  "event": "COMMENT",
  "comments": [
    {
      "path": "<file>",
      "line": <line-number>,
      "side": "RIGHT",
      "body": "<comment>"
    }
  ]
}
EOF
```

Group ALL inline comments into a single review submission. Get the head SHA from `gh pr view $pr --json headRefOid -q '.headRefOid'` and line numbers from `gh pr diff $pr`.

### Summary body
Include in the review body:
1. **DoD compliance table** — one row per acceptance criterion with ✅/❌/⚠️
2. **Blocking issues** — must fix before merge
3. **Non-blocking suggestions** — style, minor improvements
4. **Overall verdict** — Approved / Changes Requested

Use `APPROVE` event only if all DoD items are ✅ and there are zero blocking issues. Use `REQUEST_CHANGES` if any DoD item is ❌ or a blocking issue exists. Use `COMMENT` otherwise.

---

## Step 6 — Report to user (NOT in the PR)

After posting, tell the user in this conversation:

**Ready for manual testing?**
- Yes — if all DoD items are ✅ and no blocking code issues
- No — list the specific blockers
- Conditionally — list what must be verified manually before QA handoff

Do NOT include this assessment inside the PR comment.
