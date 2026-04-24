# StudioCal

A mobile-first Progressive Web App for recording studio engineers to schedule sessions, avoid booking overlap, and manage studio workflow in one shared calendar.

This repository is intentionally published as a reusable public template.

Created by Mitchell Gendron.

## Live Demo

After you enable GitHub Pages (see below), the read-only demo is served at:

- `https://<your-github-username>.github.io/<your-repo-name>/`

Replace `<your-github-username>` and `<your-repo-name>` with your fork or clone’s owner and repository slug (for example, `acme` and `my-studio-cal` → `https://acme.github.io/my-studio-cal/`).

- On `*.github.io`, demo mode turns on automatically (no Google sign-in).
- Elsewhere, append `?demo=1` to any page URL to force demo mode, or `?demo=0` on GitHub Pages to test production-style login.
- Production mode still uses Firebase Authentication and Realtime Database when not in demo mode.

## Highlights

- Google sign-in with Firebase Authentication.
- Realtime booking calendar powered by Firebase Realtime Database.
- Allowlist access model for engineers.
- Owner-only admin page for access management.
- Booking, cancellation, and session confirmation flows.
- PWA support (installable, service worker, manifest).

## Portfolio Context

This project demonstrates:

- End-to-end Firebase integration in a real operations workflow.
- Practical role-aware authorization patterns (auth + rules + UI controls).
- Reliable form and state management in vanilla JavaScript.
- Production deployment readiness for a small business web app.

## Quick Start (For Cloning This Repo)

1. Clone the repository.
2. Install and verify Firebase CLI:
   - `npx -y firebase-tools@latest --version`
3. Authenticate with Firebase:
   - `npx -y firebase-tools@latest login`
4. Create your own Firebase project (or use an existing one), then replace placeholders in:
   - `js/firebase-config.js`
   - `js/auth.js`
   - `database.rules.json`
   - `.firebaserc`
   - `firebase.json`
5. Select your Firebase project locally:
   - `npx -y firebase-tools@latest use --add <your-project-id>`
6. Run local hosting:
   - `npx -y firebase-tools@latest emulators:start --only hosting`
7. Open:
   - `http://localhost:5000`

## Enable GitHub Pages

1. On GitHub, open **your** repository → **Settings** → **Pages** (not someone else’s URL).
2. Under **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (or your default branch)
   - **Folder**: `/ (root)`
3. Save and wait for the Pages deployment to finish.
4. Your site URL follows GitHub’s pattern: `https://<your-github-username>.github.io/<your-repo-name>/`

## Firebase Config Pattern

This app is static HTML/CSS/JS (no bundler), so runtime config is read directly from `js/firebase-config.js`.

- Use `.env.example` as a checklist/template for your values.
- Copy those values into `js/firebase-config.js`.

If you later add a build step (Vite/Next/Webpack), you can move to true environment-variable injection.

## Public Template Notes

Sensitive project-specific values have been stripped and replaced with placeholders:

- Firebase project identifiers and web config values.
- Owner emails and owner UIDs.
- Security rule owner UIDs.
- Local auth export and sample booking data with real identifiers.

Before production use, replace every `YOUR_...` value with your own values.

## Roles

- Owner
  - Emails and UIDs are configured in `js/auth.js`.
  - Can access `admin.html` to manage allowlisted engineers.
- Engineer
  - Must be allowlisted to access booking pages.

## Deployment

- Deploy Hosting:
  - `npx -y firebase-tools@latest deploy --only hosting`
- Deploy Realtime Database rules:
  - `npx -y firebase-tools@latest deploy --only database`

## Security Notes

- Firebase web config in the client is public by design.
- Protection comes from strict database rules and auth checks.
- Keep `database.rules.json` reviewed and deployed with each rules change.
- Add every served domain to Firebase Auth authorized domains.

## Project Structure

- `css/`
- `icons/`
- `js/`
- `admin.html`
- `booking.html`
- `calendar.html`
- `confirm.html`
- `database.rules.json`
- `firebase.json`
- `index.html`
- `manifest.json`
- `service-worker.js`

## License

This project is licensed under the MIT License. See `LICENSE`.
