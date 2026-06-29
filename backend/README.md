# SVP Backend

Node.js + Express backend for the Saudi Visa Prep system.

## Features
- Admin and candidate login (JWT)
- CRUD APIs for users, questions, admins
- Settings and trades endpoints
- Report filtering endpoint (agent/trade/status/search)
- JSON file persistence (no external DB required)

## Quick Start
1. Install dependencies:
   npm install
2. Create env file:
   copy .env.example .env
3. Run in dev mode:
   npm run dev
4. API base URL:
   http://localhost:4000/api

## Main Endpoints
- POST /api/auth/admin/login
- POST /api/auth/candidate/login
- GET, POST /api/users
- GET, PUT, DELETE /api/users/:id
- GET, POST /api/questions
- GET, PUT, DELETE /api/questions/:id
- GET, PUT /api/settings
- GET, PUT /api/trades
- GET, POST /api/admins
- GET, PUT, DELETE /api/admins/:id
- GET /api/reports

## Notes
Current frontend still uses localStorage. This backend is ready; frontend can be switched to API calls in the next step.
