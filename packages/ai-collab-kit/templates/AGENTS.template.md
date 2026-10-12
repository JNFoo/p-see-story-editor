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

## Never
- Put secrets, personal data or other people's text in the repository.
- Add code you cannot license under [license]. Say where an idea came from.
- Force-push, or rewrite another session's work without saying so in the commit message.

## Sessions working together
Before you start: `git fetch`, read `TASKS.md`, put your row in it and push that small commit first. Rebase on the latest `main` before you push.

## Handing over
End with: what changed, how it was checked (commands and results), what is left, and one next step.
