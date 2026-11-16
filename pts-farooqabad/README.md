# PTS Farooqabad — Biometric Attendance & Trainee Management System

Phase 1: development environment scaffold. Backend (Node/Express) and frontend
(React/Vite/Ant Design) both boot independently; the frontend's status page
confirms the full chain — browser → API → MySQL — is wired correctly.

## Prerequisites

- Node.js 20 LTS
- MySQL Server 8.0.x, running locally
- Git

## 1. Database

Open a MySQL client (Workbench or `mysql` CLI) and run:

```sql
CREATE DATABASE pts_farooqabad CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'pts_app'@'localhost' IDENTIFIED BY 'ChangeThisPassword!';
GRANT ALL PRIVILEGES ON pts_farooqabad.* TO 'pts_app'@'localhost';
FLUSH PRIVILEGES;
```

No tables yet — schema and migrations start in Phase 2. This step only needs
the database and app user to exist so the backend can connect.

## 2. Backend

```powershell
cd backend
copy .env.example .env
# edit .env — set DB_PASSWORD to match the user you created above
npm install
npm run dev
```

Expected console output ends with something like:

```
PTS Farooqabad API listening on port 5000 [development]
API base path: /api/v1
MySQL connection verified.
```

If you see `MySQL is not reachable yet`, the server still boots — check
`DB_PASSWORD` in `.env` and that the MySQL service is running.

## 3. Frontend

In a second terminal:

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. You should see the PTS Farooqabad shell with a
navy sidebar, and a status card confirming the backend and MySQL are both
reachable.

## Git

```powershell
git init
git add .
git commit -m "Phase 1: project scaffold"
```

`.env` files are excluded via `.gitignore` in both `backend/` and `frontend/`
— never commit real credentials.
