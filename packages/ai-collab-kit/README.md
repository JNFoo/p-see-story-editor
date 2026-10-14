# ai-collab-kit

A written **process** for a person and an AI assistant building software together, taken from how the Story Editor in this repository was built: one human who is not a programmer, one AI session after another, many rounds, and a result that is small, checked and shipped. It is not code. It is the part that made the code trustworthy.

| File | For | What it is |
|---|---|---|
| [GUIDE.md](GUIDE.md) | both | The ten habits, the testing and speed recipes, the pitfalls we hit, and a checklist for a new project. Everything in it was done and measured here; where something was not re-checked it says so. |
| [templates/AGENTS.template.md](templates/AGENTS.template.md) | AI | A starting `AGENTS.md` (or `CLAUDE.md`) for your own repository: how to work, an always / ask first / never tier, cost habits, how to hand over. |
| [templates/TASKS.template.md](templates/TASKS.template.md) | both | A task board that several sessions can share without stepping on each other. |
| [templates/session-brief.template.md](templates/session-brief.template.md) | human | What to tell a fresh AI session in the first message, in two minutes. |

## Why a process and not a tool

The expensive mistakes in AI-assisted building are not typos. They are a feature that quietly stopped working, a "tested" claim that tested nothing, a fix that broke the neighbor, a size that crept up, and a session that could not tell what the last one did. The habits in the guide each remove one of those, and each is cheap: a table that lists every field, a test that compares two implementations, a size ceiling that fails the build, a log with one line per check.

## How to use it

1. Read the ten habits in [GUIDE.md](GUIDE.md) (five minutes).
2. Copy the templates into your repository and edit them for your project.
3. Paste the session brief at the start of every new AI session.

Related, in this repository: the [editor's QA suites](../../editor/qa/README.md) and the [Firefox test shim](../qa-kit/README.md) are the working examples of the testing habits. In [JS-modules](https://github.com/JNFoo/JS-modules), `AGENTS.md` and `TASKS.md` show the same task-board idea used by several sessions at once.

---
Part of [p-see-story-editor](../../README.md) · MIT License · Copyright (c) 2026 JNFoo
