# Docker Compose Sample Projects

A single repository holding several small, self-contained Docker sample projects.
Each project lives in its own directory, has its own README, and can be run
without touching the others.

| Project | Directory | What it demonstrates | Port |
| --- | --- | --- | --- |
| 1. Python Task Manager | [`python_app/`](python_app/) | A 3-service Docker Compose stack: PostgreSQL, a Flask API and a React frontend served by nginx | `3000`, `5001`, `5432` |
| 2. Multi-stage Build | [`multi_stage_build/`](multi_stage_build/) | A multi-stage Dockerfile that compiles a Go binary and ships it in a ~6.5 MB `scratch` image | `8080` |

---

## Prerequisites

- **Docker Desktop** (or Docker Engine + Compose v2) installed and running.

  ```bash
  docker --version
  docker compose version
  ```

- Nothing else. You do **not** need Python, Node.js, npm or Go installed on
  your machine — every project builds and runs entirely inside Docker.

---

## Conventions

- **One directory per project.** Each directory holds its own
  `docker-compose.yml`, its own Dockerfiles and its own README.
- **Run each project from its own directory.** Compose resolves relative paths
  (like `./init.sql`) from the directory that contains the `docker-compose.yml`,
  so `cd` into the project folder before running any command.
- **Ports do not overlap**, so all projects can run side by side.
- **Each stack gets its own network and volumes**, so service names such as
  `db`, `backend` and `frontend` never clash between projects.

---

## Running a project

Every project follows the same three-step shape:

```bash
cd <project-directory>      # 1. enter the project
docker compose build        # 2. build the images
docker compose up -d        # 3. start the stack in the background
```

Then open the URL for the service you want to look at, and read that
project's README for the details.

---

## Running both projects at the same time

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
| `port is already allocated` | Another process holds the port. Change the left-hand side of the `ports:` mapping in that project's `docker-compose.yml` (e.g. `"3001:80"`). |
| The build is slow the first time | The first build pulls base images and installs dependencies. Later builds use the layer cache. |
| Changes to a file are not showing | Rebuild the affected service: `docker compose up -d --build <service>`. |

Project-specific issues are listed in each project's own README.
