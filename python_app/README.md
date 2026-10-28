# Project 1 — Python Task Manager

A small full-stack task manager built as a **three-service Docker Compose stack**:
PostgreSQL for storage, a Flask API for business logic, and a React frontend
served by nginx.

```
                  ┌──────────────┐
  browser :3000 ─▶│   frontend   │  nginx:1.27-alpine serving the React build
                  │   (nginx)    │
                  └──────┬───────┘
                         │ /api/tasks → backend:5000
                         ▼
                  ┌──────────────┐
                  │   backend    │  Flask + SQLAlchemy
                  │ (python:3.10)│
                  └──────┬───────┘
                         │ postgresql://…@db:5432/tasksdb
                         ▼
                  ┌──────────────┐
                  │      db      │  PostgreSQL 13
                  │  (postgres)  │  seeded by init.sql
                  └──────────────┘
```

---

## Prerequisites

- **Docker Desktop** (or Docker Engine + Compose v2) installed and running.
- Nothing else. Python, Node.js and npm are **not** needed on your machine —
  everything builds and runs inside Docker.

```bash
docker --version
docker compose version
```

> Run every command below from inside this directory (`python_app/`). Compose
> resolves relative paths (like `./init.sql`) from the directory that holds the
> `docker-compose.yml`.

---

## Step 1 — Go into the project

```bash
cd python_app
```

## Step 2 — Build the images

```bash
docker compose build
```

This builds two images from the local Dockerfiles:

- `python_app-backend` → `python:3.10-slim` + the Python dependencies
- `python_app-frontend` → a two-stage build: `node:18-alpine` compiles the React
  bundle, `nginx:1.27-alpine` serves it

The first build takes a few minutes (the React toolchain is large). Later
builds reuse the Docker layer cache and are much faster.

## Step 3 — Start the stack

```bash
docker compose up -d
```

`-d` runs the containers in the background. Compose also creates a private
network and a named volume (`db-data`) that keeps your data between restarts.

Check that everything came up:

```bash
docker compose ps
```

Expected output — three services in `Up` state:

```
NAME                       IMAGE                     SERVICE    STATUS
python_app-backend-1       python_app-backend        backend    Up (healthy)
python_app-db-1            postgres:13               db         Up (healthy)
python_app-frontend-1      python_app-frontend       frontend   Up (healthy)
```

Both `db` and `backend` report `(healthy)` — the healthchecks are described in
[How the pieces fit together](#how-the-pieces-fit-together).

## Step 4 — Open the app

Open **<http://localhost:3000>** in your browser.

You should see the colourful **Task Manager** dashboard: a gradient headline, a
row of stat cards (Total / Active / Completed), an input box with an **Add
Task** button, and filter pills for *All*, *Active* and *Done*.

Type a task, press **Add Task** (or hit Enter) and it appears in the list. Click
the circle to mark a task done, or click **✕** to delete it.

The page is served by nginx, so it answers **immediately** — you do not have to
wait for a compiler or for the API before the first request succeeds.

## Step 5 — Verify the API directly

The Flask API is published on host port **5001** (container port 5000):

```bash
# List tasks
curl http://localhost:5001/tasks

# Create a task
curl -X POST http://localhost:5001/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"my first task"}'

# Mark it done
curl -X PUT http://localhost:5001/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'

# Delete it
curl -X DELETE http://localhost:5001/tasks/1
```

The same routes are also reachable through the frontend's nginx proxy, which is
what the browser uses:

```bash
curl http://localhost:3000/api/tasks
```

## Step 6 — Follow the logs

```bash
docker compose logs -f
```

Useful when something does not come up. Press `Ctrl+C` to stop following.

## Step 7 — Stop and clean up

```bash
# Stop and remove the containers (your data volume survives)
docker compose down

# Stop and remove the containers AND the database volume (fresh start next time)
docker compose down -v
```

---

## Ports summary

| Service | Host port | Container port | URL |
| --- | --- | --- | --- |
| frontend | 3000 | 80 | <http://localhost:3000> |
| backend | 5001 | 5000 | <http://localhost:5001/tasks> |
| db | 5432 | 5432 | `postgresql://postgres:postgres@localhost:5432/tasksdb` |

---

## How the pieces fit together

### The frontend is a static build served by nginx

The frontend image is built in **two stages** (`frontend/Dockerfile`):

1. **`build`** — `node:18-alpine` runs `npm install` and `npm run build`, which
   produces a static bundle in `build/`.
2. **runtime** — `nginx:1.27-alpine` copies that bundle into
   `/usr/share/nginx/html` and serves it on port 80.

**Why not `npm start`?** The original single-stage image ran the React *dev
server* (`react-scripts start`). A dev server has to compile the whole app
before it binds its port, so the first browser request after `docker compose up`
was met with *connection refused*. nginx serves pre-built files, so it is ready
in milliseconds and the UI is reachable on the first attempt.

A production build has no dev-server proxy, so the API call is handled by
nginx itself in `frontend/nginx.conf`:

```nginx
location /api/ {
    set $backend_upstream backend:5000;
    rewrite ^/api/(.*)$ /$1 break;   # /api/tasks → /tasks
    proxy_pass http://$backend_upstream;
}
```

Two details matter here:

- **The `/api` prefix is stripped.** The Flask routes live at `/tasks`, not
  `/api/tasks`, so nginx rewrites the path before forwarding.
- **The upstream is a variable.** Docker's embedded DNS (`resolver 127.0.0.11`)
  is used so that `backend` is resolved *per request* instead of at startup.
  nginx therefore starts cleanly even when the API container is not up yet, and
  picks it up as soon as it is.

`frontend/.dockerignore` keeps `node_modules`, `build` and other local
artifacts out of the build context, so the image is not bloated by a
host-installed `node_modules`.

### The `proxy` key in `package.json`

`"proxy": "http://backend:5000"` is still in `package.json`, but it only
applies to the **dev server** (`npm start`), not to the production bundle
served by nginx. The browser path goes through the nginx `location /api/`
block described above.

### The database

- **`init.sql`** — mounted into `/docker-entrypoint-initdb.d/`. PostgreSQL runs
  it the **first** time the `db-data` volume is created, which is what creates
  the `task` table. If you already have a volume, changing `init.sql` has no
  effect — run `docker compose down -v` to re-create it.
- **`db` healthcheck** — `pg_isready -U postgres -d tasksdb`. The backend waits
  for `service_healthy`, so the API never starts against a database that is not
  ready yet.

### The backend

- **`backend/Dockerfile`** — copies `requirements.txt` before the source code so
  the dependency install layer is cached across code changes.
- **`backend` healthcheck** — a tiny `urllib` request against
  `http://localhost:5000/tasks`. It reports when the API is really answering,
  not just when the process is alive.
- **`frontend` depends on `backend: service_started`** (not
  `service_healthy`). The frontend is a static site: it must come up even while
  the API is still booting. nginx resolves `backend` per request, so the API
  connects automatically as soon as it is ready.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Browser shows *connection refused* on <http://localhost:3000> | The frontend container is not running. Check `docker compose ps` and `docker compose logs frontend`. |
| UI loads but the task list is empty and the console shows a fetch error | The API is not up yet, or `backend` is not resolvable. Check `docker compose logs backend` and `docker compose ps` — the backend should be `Up (healthy)`. |
| The frontend shows the old version of the UI | The image is stale. Rebuild: `docker compose up -d --build frontend`. |
| The `task` table does not exist | The `db-data` volume was created before `init.sql` existed. Run `docker compose down -v` and start again. |
| Changes to `init.sql` have no effect | `init.sql` only runs on first initialisation of an empty volume. Use `docker compose down -v`. |
| `port is already allocated` | Another process holds the port. Change the left-hand side of the `ports:` mapping in `docker-compose.yml` (e.g. `"3001:80"` for the frontend). |
| The build is slow the first time | The React dependency tree is large. Later builds use the layer cache. |
