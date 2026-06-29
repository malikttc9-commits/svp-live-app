# Permanent Live Deployment (Stable URL)

This project is configured to run full system (frontend + backend) on a single Node service.

## What is already configured
- Backend serves APIs at `/api/*`
- Backend also serves frontend pages:
  - `/` and `/user` -> `user.html`
  - `/main` -> `main.html`
- Frontend now auto-uses same-domain API (`window.location.origin + /api`) in production.

## One-time Deploy on Render
1. Push this folder to a GitHub repository.
2. Open Render Dashboard: https://render.com
3. Click `New +` -> `Blueprint`.
4. Select your repository.
5. Render will detect `render.yaml` and create service automatically.
6. After deploy, open your stable URL, for example:
   - `https://svp-live-app.onrender.com/`

## Permanent No-Issue Setup (Git + Render Attached)
Use these once to avoid repeat deployment issues.

1. Make sure local Git is installed and available in terminal:
  - `git --version`
2. Connect local project to GitHub remote (one-time):
  - `git remote add origin <YOUR_GITHUB_REPO_URL>`
  - `git branch -M main`
  - `git push -u origin main`
3. In Render service settings:
  - Keep `Auto-Deploy` set to `On`.
  - Keep branch set to `main` (or your default branch).
4. Add Render Deploy Hook fallback (recommended):
  - Render Dashboard -> Service -> Settings -> Deploy Hook -> Create Hook.
  - Copy hook URL.
5. Add GitHub secret so deploy can always be triggered from workflow:
  - GitHub Repo -> Settings -> Secrets and variables -> Actions.
  - Create secret: `RENDER_DEPLOY_HOOK_URL` = your Render hook URL.
6. Workflow already added in this repo:
  - `.github/workflows/render-redeploy.yml`
  - It runs on push to `main/master` and triggers Render deploy hook.

### Daily Update Flow
1. `git add .`
2. `git commit -m "your update message"`
3. `git push`

Render deployment will trigger automatically.

## Required Environment Variables
Already defined in `render.yaml`:
- `NODE_ENV=production`
- `JWT_SECRET` (auto generated)
- `CORS_ORIGIN=*`
- `FRONTEND_DIR=../`
- `DATA_FILE=./data/db.json`

## Notes
- Free hosting may sleep after inactivity; paid plan removes cold starts.
- JSON file storage may reset on some free plans. For long-term persistent data, move to a real database.

## Local run check
From `backend` folder:
- `npm install`
- `npm start`
- Open `http://localhost:4000/`
