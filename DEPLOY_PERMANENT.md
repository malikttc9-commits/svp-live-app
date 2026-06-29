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
