# Docker Compose Sample Projects

A single repository holding several small, self-contained Docker sample projects.
Each project lives in its own directory and has its own README, so you can run
one without touching the others.

| Project | Directory | What it demonstrates |
| --- | --- | --- |
| 1. Python Task Manager | [`python_app/`](python_app/) | A 3-service Docker Compose stack: PostgreSQL, a Flask API and a React frontend |
| 2. Multi-stage Build | [`multi_stage_build/`](multi_stage_build/) | A multi-stage Dockerfile that compiles a Go binary and ships it in a ~7 MB `scratch` image |

---

## Prerequisites

- **Docker Desktop** (or Docker Engine + Compose v2) installed and running.
  Verify with:

  ```bash
  docker --version
  docker compose version
  ```

- Nothing else. You do **not** need Python, Node.js, npm or Go installed on
  your machine — every project builds and runs entirely inside Docker.

> **Windows / Linux note:** run all commands from inside the project directory.
> Compose resolves relative paths (like `./init.sql`) from the directory that
> contains the `docker-compose.yml`.

---

## Project 1 — Python Task Manager

A small full-stack task manager.

```
                  ┌──────────────┐
  browser :3000 ─▶│   frontend   │  React (create-react-app)
                  │  (node:18)   │
                  └──────┬───────┘
                         │ fetch("/tasks") proxied to backend:5000
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

### Step 1 — Go into the project

```bash
cd python_app
```

### Step 2 — Build the images

```bash
docker compose build
```

This builds two images from the local `Dockerfile`s:

- `python_app-backend` → `python:3.10-slim` + the Python dependencies
- `python_app-frontend` → `node:18-alpine` + the npm dependencies

The first build takes a few minutes (the React toolchain is large). Later
builds reuse the Docker layer cache and are much faster.

### Step 3 — Start the stack

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
python_app-backend-1       python_app-backend        backend    Up
python_app-db-1            postgres:13               db         Up (healthy)
python_app-frontend-1      python_app-frontend       frontend   Up
```

The `db` service shows `(healthy)` because Compose waits for its healthcheck to
pass before starting the backend — that is what stops the API from booting
against a database that is not ready yet.

### Step 4 — Open the app

Open **<http://localhost:3000>** in your browser.

You should see a "Task Manager" heading, an input box and an **Add** button.
Type a task, press **Add**, and it appears in the list. Click the task text to
mark it done (it gets struck through), or click ❌ to delete it.

### Step 5 — Verify the API directly

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

The frontend talks to the backend through the dev-server proxy, so you can call
the same routes on port 3000 as well:

```bash
curl http://localhost:3000/tasks
```

### Step 6 — Follow the logs

```bash
docker compose logs -f
```

Useful when something does not come up. Press `Ctrl+C` to stop following.

### Step 7 — Stop and clean up

```bash
# Stop and remove the containers (your data volume survives)
docker compose down

# Stop and remove the containers AND the database volume (fresh start next time)
docker compose down -v
```

### Ports summary

| Service | Host port | Container port | URL |
| --- | --- | --- | --- |
| frontend | 3000 | 3000 | <http://localhost:3000> |
| backend | 5001 | 5000 | <http://localhost:5001/tasks> |
| db | 5432 | 5432 | `postgresql://postgres:postgres@localhost:5432/tasksdb` |

### How the pieces fit together

- **`docker-compose.yml`** — declares the three services, the shared network,
  the `db-data` volume and the `depends_on` order. The `db` service has a
  `healthcheck` and the backend waits for `service_healthy`, so the API never
  starts against a database that is not ready yet.
- **`init.sql`** — mounted into `/docker-entrypoint-initdb.d/`. PostgreSQL runs
  it the **first** time the `db-data` volume is created, which is what creates
  the `task` table. If you already have a volume, changing `init.sql` has no
  effect — run `docker compose down -v` to re-create it.
- **`backend/Dockerfile`** — copies `requirements.txt` before the source code so
  the dependency install layer is cached across code changes.
- **`frontend/package.json`** — the `"proxy"` key points the React dev server
  at `http://backend:5000`, i.e. the service name on the Compose network. This
  is what makes `/tasks` work in the browser.

> **Common issue:** if the browser shows *Proxy error: Could not proxy request
> /tasks*, the frontend is pointing at the wrong host. Inside a Compose network
> the backend is reached by its **service name** (`backend:5000`), not by
> `localhost:5000` (the host publishes it on `5001`, and `localhost` inside the
> frontend container refers to the frontend container itself).

---

## Project 2 — Multi-stage Build

A tiny Go HTTP server used to show **how and why** a multi-stage Dockerfile
produces a dramatically smaller image than a single-stage one.

Read the full explanation in [`multi_stage_build/README.md`](multi_stage_build/README.md).

### Quick start

```bash
cd multi_stage_build
docker compose up --build
curl http://localhost:8080
```

Expected response:

```
Hello from the multi-stage build demo!
Served by a statically compiled Go binary (CGO disabled).
```

Stop it with `Ctrl+C` (or `docker compose down` if you ran it detached).

### What it shows

The `Dockerfile` has two stages:

1. **`builder`** — uses the full `golang:1.22-alpine` image to compile the
   source into a static binary.
2. **`scratch`** — an empty base image containing nothing but that binary.

The measured result on this machine:

| Build | Image size |
| --- | --- |
| `Dockerfile` (multi-stage) | **6.53 MB** |
| `Dockerfile.single` (single-stage, for comparison) | **436 MB** |

That is roughly a **67× smaller** image for the exact same application.

---

## Running both projects at the same time

The two projects use different host ports (`3000`, `5001`, `5432` vs `8080`),
so they do not conflict. Start each from its own directory:

```bash
# Terminal 1
cd python_app && docker compose up -d

# Terminal 2
cd multi_stage_build && docker compose up -d
```

Both stacks create their own Compose network, so the service names `db`,
`backend` and `frontend` do not clash either.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot connect to the Docker daemon` | Docker Desktop is not running. Start it and re-run. |
| `port is already allocated` | Another process holds the port. Change the left-hand side of the `ports:` mapping in `docker-compose.yml` (e.g. `"3001:3000"`). |
| Frontend loads but the task list is empty and the console shows a proxy error | The frontend proxy target is wrong — it must be `http://backend:5000` (see the note in Project 1). |
| The `task` table does not exist | The `db-data` volume was created before `init.sql` existed. Run `docker compose down -v` and start again. |
| Changes to `init.sql` have no effect | `init.sql` only runs on first initialisation of an empty volume. Use `docker compose down -v`. |
| Changes to the frontend code are not showing | Rebuild: `docker compose up -d --build frontend`. |
| Build is slow the first time | The React dependency tree is large. Later builds use the layer cache. |
