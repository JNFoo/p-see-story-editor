# Notes for AI assistants (and the people working with them)

<!-- Replace the bracketed parts. Keep it short: an assistant reads this at the start of every session. -->

## What this project is
[One or two sentences: what it makes, who uses it, what must never be lost.]

## How to work here
- Plain words first: say what a change means for the user, then how it works.
- Ask before larger features (with short multiple-choice options and a recommended one first); do small, reversible, clearly asked changes without asking.
- Build with `[command]`. Run `[quick check command]` before and after a change; run `[full check command]` before you hand anything over.
- Never edit generated files: [list them]. Edit [the source] and rebuild.
- Every behavior you change gets a check that would have failed before the change.
- Never claim "tested" for something you did not run; say what you ran and its result.
- Report the real elapsed time and approximate compute at the end of a request.

## Always / ask first / never
Three tiers, so a new session knows how much room it has. Fill in the brackets; delete lines that do not apply.
- **Always** (no need to ask): run the quick check before and after a change; add a check for every behavior you change; write the result of every check you ran in your hand-over; keep a change small enough to undo with one commit.
- **Ask first** (use short multiple-choice questions, the recommended one first): a new feature, anything that changes how the finished product looks or feels, a change to a saved-file or save-data format, a size budget raised, a new dependency, a rewrite of another session's file, anything that deletes data. [Add your project's own.]
- **Never**: see the list below.

## Cost habits
Compute and waiting time are real costs; spend them on purpose.
- Hold benchmarks and slow checks until a design is final; during design, run only the quick check.
- Run the quick check first and the full check once, before handing over; do not repeat a slow check you already ran on the same files.
- Keep screenshots and long logs out of the conversation unless the question is about how something looks; read a one-line summary first and open the full log only for a failure.
- Prefer one measured number over a long argument, and say how it was measured.
- Say the real elapsed time and the approximate compute at the end, so the cost of a request is known.

## Never
- Put secrets, personal data or other people's text in the repository.
- Add code you cannot license under [license]. Say where an idea came from.
- Force-push, or rewrite another session's work without saying so in the commit message.

## Sessions working together
Before you start: `git fetch`, read `TASKS.md`, put your row in it and push that small commit first. Rebase on the latest `main` before you push.

## Handing over
End with: what changed, how it was checked (commands and results), what is left, and one next step.
