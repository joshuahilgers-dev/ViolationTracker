# Technology Violation Tracker

Local staff web app for tracking student technology violations, intervention steps, and follow-up actions.

## Run It

1. Open this folder in PowerShell.
2. Start the app:

   ```powershell
   npm start
   ```

3. Open `http://localhost:4173`.

The app stores data in `data/technology-tracker.sqlite`. This is a real SQL database, so the first prototype can run without installing PostgreSQL, SQL Server, or extra packages.

## Current Workflow Rules

- Two minor violations: queue a Digital Impact Reflection and parent notification.
- Three minor violations or one major violation: queue a Technology Success Contract and parent notification.
- Fourth total violation: queue a five school-day Chromebook restriction and a re-entry check.
- Fifth or later violation: queue admin review and parent contact.

## Database Tables

- `students`: student profile, guardian contact, and device tag.
- `infraction_types`: configurable minor and major violation categories.
- `incidents`: teacher/staff violation reports.
- `actions`: parent contact, reflection upload, contract, restriction, re-entry, and admin follow-ups.
- `audit_log`: basic record of important changes.

## Moving To PostgreSQL Or SQL Server

The app is intentionally written with a narrow database layer in `server.js`. When you are ready to host this against PostgreSQL or SQL Server, replace the `node:sqlite` connection and prepared statements with a database client for your chosen server, then keep the same tables and workflow rules.

For school deployment, the next important additions are staff login, role-based access, student import from your SIS, and a printable/exportable parent communication record.
