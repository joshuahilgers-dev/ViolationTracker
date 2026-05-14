# Technology Violation Tracker

Local staff web app for tracking student technology violations, intervention steps, and follow-up actions.

## Requirements

- Node.js 20 or newer. The school Windows Server can use its existing Node v21.7.3 and npm 10.5.0 install.
- Do not upgrade the server-wide Node install for this app.

## Run It Locally

1. Open this folder in PowerShell.
2. Install dependencies:

   ```powershell
   npm install
   ```

3. Start the development server:

   ```powershell
   npm run dev
   ```

4. Open `http://localhost:4173`.

## Production Start

Use this command on the server:

```powershell
npm start
```

The production start command runs `node server.js`.

## Build Check

This project does not compile frontend assets yet, but it includes a production readiness check:

```powershell
npm run build
```

The app stores data in `data/technology-tracker.sqlite`. This is a real SQL database powered by SQLite through `sql.js`, so it works on Node v21.7.3 without Node 24's built-in `node:sqlite` module.

## Windows Server Setup With Node v21.7.3

1. Pull or copy the project to the server.
2. Open PowerShell in the project folder.
3. Confirm the existing runtime:

   ```powershell
   node -v
   npm -v
   ```

   Expected server versions are Node `v21.7.3` and npm `10.5.0`.

4. Install dependencies:

   ```powershell
   npm install
   ```

5. Run the build check:

   ```powershell
   npm run build
   ```

6. Start the app:

   ```powershell
   npm start
   ```

7. Open `http://localhost:4173` on the server, or expose that port through your normal internal server process.

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
