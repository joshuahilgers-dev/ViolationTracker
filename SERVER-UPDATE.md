# Updating TechViolations through GitHub

The local project is `C:\Users\hilgersjw\Documents\TechViolations`.
Its GitHub repository is https://github.com/joshuahilgers-dev/ViolationTracker and its deployment branch is `main`.
The school server's installation folder must be confirmed on the server; it may differ from the local path.

## September 9, 2026 update

- Navigation and quick action say **New Tech Violation** and **Add Tech Violation**.
- The student list starts collapsed and collapses on navigation and student review. It can still open for searching.
- Student records include **Back to dashboard** and **Export PDF**.
- The student header keeps common actions visible, moves student deletion into **More actions**, and no longer repeats the current-step badge.
- Active current- and previous-term violations include **Remove violation**. A reason is required; the entry remains auditable, stops counting toward the student's step, and related open follow-ups are reconciled to the recalculated step.
- PDFs contain current and previous-term history, notes, canceled entries, step adjustments, follow-ups, and an uploaded-document index. Uploaded files themselves are not embedded.
- Empty violation, adjustment, follow-up, and document sections are omitted from PDFs.
- PDF downloads use the existing staff authentication. Exporting does not send email or change student records.

This update adds a PDF dependency. Run `npm ci` on the server after pulling. No database migration is required for these features.

## 1. Publish changes from the development computer

For future changes, open PowerShell in the local TechViolations project. Check the repository and changes before staging specific source files:

```powershell
git remote -v
git status --short
git diff
npm run build
```

After checks pass, stage the intended files, commit them, and push:

```powershell
git add package.json package-lock.json public/index.html public/app.js server.js student-history-pdf.cjs scripts/build-check.js SERVER-UPDATE.md
git diff --cached --stat
git commit -m "Update tech violation labels and student history PDF export"
git push origin main
```

Adjust the file list and commit message for future updates. Do not include `.env`, databases, uploaded student documents, or logs. The current ignore rules do not cover every possible file under `data/`, so avoid staging everything indiscriminately.

## 2. Identify and back up the existing server installation

On the school server, open PowerShell in the folder that already contains this application's `server.js`, `package.json`, and `data` folder. Confirm:

```powershell
Get-Location
git remote -v
git branch --show-current
git status --short
git rev-parse HEAD
```

The remote should point to `joshuahilgers-dev/ViolationTracker` and the branch should be `main`. Save the commit ID as your rollback reference. If tracked files have local changes, reconcile them before pulling; do not discard them or run a hard reset.

Identify how this specific app is started (Task Scheduler, a Windows service, or a console). For a scheduled task, inspect its Actions tab to confirm that it points to this installation. The local startup scripts use the name `Technology Violation Tracker`, but the live server's setup has not been verified.

Stop only this application's task/service/process, and confirm its Node process has exited before backing up or pulling. Do not stop every Node process on a shared school server. Prevent any configured automatic restart during maintenance, and restore that setting afterward.

Back up the entire installation, including `data/`, uploaded documents, `.env` if present, and its startup configuration, to a protected server backup location outside the repository. If `DB_PATH` is configured, also back up that database at its actual location. Retain the existing machine environment settings. Keep the backup off GitHub.

## 3. Pull, install, and check

Run these commands individually from the existing server project folder. Continue only when each command succeeds:

```powershell
git pull --ff-only origin main
npm ci
npm run build
git log -1 --oneline
```

If the pull reports local changes or diverging history, stop and resolve that issue before continuing. Do not overwrite the server's `.env`, data, or startup settings. This update does not require a server-wide Node upgrade or reinstalling the startup task.

## 4. Restart and verify

Start the app through its existing task or service. If you confirmed the task name above, the commands are:

```powershell
Stop-ScheduledTask -TaskName "Technology Violation Tracker"
Start-ScheduledTask -TaskName "Technology Violation Tracker"
```

The stop command belongs before the backup/pull step; it is shown here alongside the matching start command for reference. For an existing console installation, use `npm start` from the project folder. Do not launch a second copy alongside a running service or task.

Open the usual school URL and hard-refresh with Ctrl+F5. Confirm staff sign-in, the revised labels, and existing records. Expand Student List, review a student, and confirm the list collapses. Use **Back to dashboard**. Export a PDF, open it, and check its student identity and history before attaching it to parent communication.

## Rollback if needed

Stop the app again. With a clean tracked working tree, check out the saved pre-update commit with `git switch --detach <saved-commit-id>`, run `npm ci` and `npm run build`, and restart through the original task or service. Keep current student data in place: these feature changes do not require a database rollback. Restore data from backup only if data recovery is actually needed, accounting for any records entered since the backup. After the issue is corrected, return to `main` and follow the update process again.

## Verification record

The local build and synthetic-data checks passed for PDF downloads, long/empty/archived histories, missing students, authentication, safe filenames, record preservation, and list collapse during navigation and student review. The school server deployment and its startup method require verification on that server.
