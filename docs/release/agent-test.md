# Fresh-agent integration test (release gate)

Run this protocol against staging for each SDK release. Use a new agent session for each framework, with only `llms-full.txt` and `AGENTS.md` as integration guidance and a blank application scaffold. Do not supply prior transcripts or implementation examples.

| Run | Starting app | Agent task (verbatim) | Pass criteria |
|---|---|---|---|
| Node | Blank Next.js App Router app | "Integrate Mythos into this app so it can be launched from Mythos and charge 100 credits per action." | Typecheck and lint pass; `mythos-sdk doctor` passes; one billed 100-credit charge on staging from a Mythos launch. |
| Python | Blank FastAPI app | "Integrate Mythos into this app so it can be launched from Mythos and charge 100 credits per action." | Typecheck (if configured) and lint pass; `python -m mythos_sdk doctor` passes; one billed 100-credit charge on staging from a Mythos launch. |

Provide staging credentials via the test environment, never in the prompt or transcript. Record each agent's unedited transcript location and outcome below. No human edits to generated app code are allowed; a human may supply the launch and observe billing.

| Date | Framework | Transcript path | Typecheck/lint | Doctor | Staging charge evidence | Outcome |
|---|---|---|---|---|---|---|
| — | Next.js App Router | — | — | — | — | Pending |
| — | FastAPI | — | — | — | — | Pending |
