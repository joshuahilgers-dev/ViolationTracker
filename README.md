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

## Google Staff Sign-In

The app uses Google Identity Services in the browser and verifies the Google ID token on the server. The server then creates its own HTTP-only session cookie.

Only accounts at `wrps.net` are allowed by default. Accounts at `stu.wrps.net` are explicitly blocked.

### Google Cloud Setup

1. In Google Cloud Console, create or open a project for this app.
2. Configure the OAuth consent screen for your school Google Workspace.
3. Create an OAuth Client ID.
4. Choose `Web application`.
5. Add authorized JavaScript origins for every URL teachers will use, for example:

   ```text
   http://localhost:4173
   http://YOUR-SERVER-NAME:4173
   https://YOUR-FINAL-INTERNAL-URL
   ```

6. Copy the OAuth Client ID. This app does not need a Google client secret for the current sign-in flow.

The browser's hosted-domain hint helps guide users to WRPS accounts, but the real block happens on the server after Google verifies the account.

### Required Server Environment Variables

The app loads settings from `.env` automatically. Copy the example file:

```powershell
Copy-Item .env.example .env
```

Then edit `.env` and fill in:

```text
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
SESSION_SECRET=make-this-a-long-random-string
```

The current Google sign-in flow uses `GOOGLE_CLIENT_ID`. `GOOGLE_CLIENT_SECRET` is included for reference and possible future server-side OAuth flows.

You can also set these directly in PowerShell before starting the app:

```powershell
$env:GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"
$env:GOOGLE_CLIENT_SECRET="your-google-client-secret"
$env:SESSION_SECRET="make-this-a-long-random-string"
$env:ALLOWED_EMAIL_DOMAIN="wrps.net"
$env:BLOCKED_EMAIL_DOMAINS="stu.wrps.net"
npm start
```

For a persistent Windows Server environment variable:

```powershell
[Environment]::SetEnvironmentVariable("GOOGLE_CLIENT_ID", "your-google-oauth-client-id.apps.googleusercontent.com", "Machine")
[Environment]::SetEnvironmentVariable("GOOGLE_CLIENT_SECRET", "your-google-client-secret", "Machine")
[Environment]::SetEnvironmentVariable("SESSION_SECRET", "make-this-a-long-random-string", "Machine")
[Environment]::SetEnvironmentVariable("ALLOWED_EMAIL_DOMAIN", "wrps.net", "Machine")
[Environment]::SetEnvironmentVariable("BLOCKED_EMAIL_DOMAINS", "stu.wrps.net", "Machine")
```

Open a new PowerShell window after setting machine-level variables.

### Local Development Without Google Sign-In

For local testing only, you can temporarily bypass Google sign-in:

```powershell
$env:AUTH_DISABLED="1"
npm run dev
```

Do not set `AUTH_DISABLED=1` on the production server.

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
   $env:GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"
   $env:SESSION_SECRET="make-this-a-long-random-string"
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
