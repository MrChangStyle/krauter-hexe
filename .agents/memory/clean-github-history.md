---
name: Clean GitHub history from a Replit workspace
description: How to publish a repl to GitHub as a single fresh commit without deleting the workspace .git (which powers checkpoints and task-agent merges).
---

# Publishing a clean history to GitHub

Never `rm -rf .git` in a Replit workspace to "start fresh". That repo is platform
machinery: a `gitsafe-backup` remote (checkpoints/rollback, with LFS) and one
`subrepl-*` remote per task agent. Deleting it removes the user's rollback safety
net and the merge path for task agents.

**Why the request comes up:** the workspace history can contain files that were
later deleted (database dumps, exported photos, anything with real user data).
Deleting the files now does not remove them from earlier commits, so a full push
would publish them.

**How to do it instead — an orphan commit built with plumbing, so the working
tree is never touched:**

1. Build a throwaway index and write a tree from the current files. A fresh index
   (`GIT_INDEX_FILE=/tmp/x`, `rm -f` it first, then `git add -A .`) applies
   `.gitignore` to *everything*, so paths that are tracked on the old branch but
   newly ignored simply drop out.
2. `git commit-tree <tree> -m "..."` with **no `-p`** → a commit with no parents,
   i.e. no shared ancestry with the old branch.
3. `git branch -f <name> <commit>`.
4. Switch to it **without** `git checkout`: `git symbolic-ref HEAD refs/heads/<name>`
   followed by a plain `git reset`. A real checkout would delete working-tree files
   that the old branch tracked but the new commit omits (e.g. a scratch assets
   folder the user wants to keep locally but not publish).

Verify before announcing: `git rev-list --count` is 1, `git rev-list --parents -n 1`
returns a single word, and grep the *committed tree* (`git grep <ref>`) for
connection strings, API-key shapes and private-key headers — not just the worktree.

**Push:** `gitPush` fails with `NO_REMOTE` until an `origin` exists. Connecting the
GitHub account in the Git pane does not necessarily create it, and creating a
*branch* there definitely does not. Ask the user for the repository URL, add
`origin` manually, then `gitPush({ branch: "main" })` — the local branch name may
differ from the remote one, which is how a locally-renamed clean branch still lands
as `main` on GitHub. Credentials come from the account connection; never ask for a
token.
