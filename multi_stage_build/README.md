# Project 2 — Multi-stage Docker Build

A minimal Go HTTP server whose only purpose is to make one idea concrete:

> **A multi-stage build produces a final image that contains only what the
> application needs to run — not the toolchain used to build it.**

The same source code is built two ways here, so you can compare the results
side by side:

| Dockerfile | Stages | Final image size |
| --- | --- | --- |
| `Dockerfile` | 2 (builder + `scratch`) | **6.53 MB** |
| `Dockerfile.single` | 1 | **436 MB** |

That is roughly a **67× difference**, for a byte-identical program.

---

## Quick start

```bash
cd multi_stage_build

# Build and run
docker compose up --build

# In another terminal
curl http://localhost:8080
```

Expected response:

```
Hello from the multi-stage build demo!
Served by a statically compiled Go binary (CGO disabled).
```

Stop the server with `Ctrl+C`.

---

## What a multi-stage build is

A `Dockerfile` can contain several `FROM` instructions. Each `FROM` starts a
**stage** — an independent build environment with its own filesystem, its own
installed packages and its own build cache.

```
Stage 1 (builder)                    Stage 2 (runtime)
┌────────────────────────┐           ┌────────────────────────┐
│ FROM golang:1.22-alpine│          │ FROM scratch            │
│                        │           │                        │
│ go mod download        │           │  COPY --from=builder   │
│ go build -o /out/app . │  ──────▶  │        /out/app /app    │
│                        │  the      │                        │
│ Go toolchain  ✗        │  binary   │  Go toolchain  ✗        │
│ Module cache  ✗        │  only     │  Module cache  ✗        │
│ Source code    ✗        │           │  Source code    ✗        │
└────────────────────────┘           └────────────────────────┘
                                     └────────────────────────┘
                                       ~7 MB total
```

The rule that makes it work:

- Only files explicitly copied **out of** a stage end up in the final image.
- Everything else in that stage — the compiler, the package manager, the
  dependency cache, the source code — is thrown away when the build moves on.
- Stages run in order, but only the **last** stage is the image you run.

---

## The Dockerfile, line by line

```dockerfile
# syntax=docker/dockerfile:1

# --- Stage 1: builder ---------------------------------------------------
FROM golang:1.22-alpine AS builder

WORKDIR /src

# Copy the module files first so the dependency download layer is cached and is
# only rebuilt when go.mod / go.sum actually change.
COPY go.mod ./

# Download dependencies into a module cache inside the image.
RUN go mod download

# Copy the application source.
COPY . .

# Build a static binary:
#   CGO_ENABLED=0      -> no libc dependency, so the binary runs on a bare image
#   -trimpath          -> strip local filesystem paths from the binary
#   -ldflags "-s -w"    -> strip the symbol table and DWARF debug info (smaller)
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/app .

# --- Stage 2: runtime ---------------------------------------------------
FROM scratch

# Copy the static binary from the builder stage.
COPY --from=builder /out/app /app

# Run as a non-root user. In scratch there is no /etc/passwd, so the numeric
# UID is used directly.
USER 65532:65532

EXPOSE 8080

# Tell the kernel to send SIGTERM to the process when the container stops.
STOPSIGNAL SIGTERM

ENTRYPOINT ["/app"]
```

### Why each of these choices exists

**`FROM scratch`**
`scratch` is a special empty image — literally a filesystem with nothing in
it. It has no shell, no package manager and no utilities. The only thing that
can go in it is a self-contained binary, which is exactly why this pattern
pairs so well with Go: a Go binary built with `CGO_ENABLED=0` needs no
dynamic linker and no shared libraries, so it runs on an image with no OS at
all.

**`CGO_ENABLED=0`**
By default Go links against the system C library, which produces a binary that
needs `libc.so` at runtime. Setting `CGO_ENABLED=0` produces a *statically
linked* binary that carries everything it needs inside itself. Without this
flag the binary would fail to start in `scratch` with a "no such file or
directory" error.

**`-trimpath`**
By default Go embeds the absolute path of the build directory in the binary
for debugging. `-trimpath` removes those paths, which keeps the build
reproducible and avoids leaking your local folder names.

**`-ldflags "-s -w"`**
`-s` strips the symbol table and `-w` strips the DWARF debug information.
Both shrink the binary with no effect on runtime behaviour — handy when you
are not shipping debug symbols to production.

**`USER 65532:65532`**
The `scratch` image has no `/etc/passwd`, so you cannot reference a named
user. Using the numeric UID directly is the standard workaround. `65532` is
the conventional "nonroot" UID used by many base images.

**`COPY --from=builder /out/app /app`**
This is the line that does the actual work of a multi-stage build. It reaches
into the completed `builder` stage and copies a single file into the new
stage. Nothing else crosses the boundary.

**`ENTRYPOINT ["/app"]`**
Written in exec form (the JSON array) rather than shell form
(`ENTRYPOINT /app`). Exec form starts the binary directly as PID 1, so it
receives `SIGTERM` from `docker stop` and shuts down cleanly. Shell form
would run it through `/bin/sh -c`, which does not forward signals — and
`scratch` has no shell anyway.

---

## Try it yourself

### 1. Build and compare the two images

```bash
# The multi-stage image
docker build -t multi-stage-demo:multi .

# The single-stage comparison image
docker build -f Dockerfile.single -t multi-stage-demo:single .
```

### 2. Compare their sizes

```bash
docker images --format '{{.Repository}}:{{.Tag}} = {{.Size}}' | grep multi-stage-demo
```

Observed output:

```
multi-stage-demo:multi = 6.53MB
multi-stage-demo:single = 436MB
```

### 3. Look at what is inside the final image

`scratch` has no shell and no utilities, so `docker run ... ls` does not work
here — the container has no `/bin/ls` to run. Export the image filesystem
instead:

```bash
docker create --name msb_inspect multi-stage-demo:multi
docker export msb_inspect | tar -tvf -
docker rm msb_inspect
```

Expected output — the only file you put there is the binary (the rest is the
empty directory skeleton Docker adds at runtime):

```
-rwxr-xr-x  0 0  0        0 .dockerenv
-rwxr-xr-x  0 0  4587672 app
drwxr-xr-x  0 0  0        0 dev/
...
```

The single-stage image, by contrast, contains the toolchain, the module cache
and the source — and it *does* have a shell, so this works normally:

```bash
docker run --rm --entrypoint /bin/ls multi-stage-demo:single -la /src
```

```
go.mod
main.go
```

### 4. Compare the number of layers

```bash
docker history multi-stage-demo:multi   --format '{{.Size}}  {{.CreatedBy}}'
docker history multi-stage-demo:single  --format '{{.Size}}  {{.CreatedBy}}'
```

The multi-stage image has around **5** layers; the single-stage image has
around **16**.

### 5. Confirm the binary is static and stripped

```bash
docker create --name msb_inspect multi-stage-demo:multi
docker cp msb_inspect:/app /tmp/app
file /tmp/app
docker rm msb_inspect
```

Expected:

```
/tmp/app: ELF 64-bit LSB executable, ARM aarch64, version 1 (SYSV),
statically linked, Go BuildID=..., stripped
```

Look for `statically linked` (no dynamic dependencies) and `stripped` (no
symbol table).

---

## Why the single-stage image is so much bigger

`Dockerfile.single` is the same program built the naive way:

```dockerfile
FROM golang:1.22-alpine

WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/app .

ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/out/app"]
```

Everything the build needed is still sitting in the final image:

| Contents | Approx. size |
| --- | --- |
| Go toolchain (`go`, `compile`, `link`, …) | ~380 MB |
| Go module cache | ~50 MB |
| Source code (`main.go`, `go.mod`) | ~1 KB |
| The compiled binary | ~4.6 MB |

None of the first three rows is needed to serve a single HTTP response. The
multi-stage build simply refuses to carry them across the stage boundary.

Beyond disk size, a lean image is also **faster to pull, faster to start, and
has a much smaller attack surface** — there is no shell and no utilities in it
for an attacker to use if the process is ever compromised.

---

## Project layout

```
multi_stage_build/
├── Dockerfile           # the multi-stage build (this is the main event)
├── Dockerfile.single    # single-stage comparison, for the size contrast
├── docker-compose.yml   # builds and runs the multi-stage image
├── main.go              # the tiny Go HTTP server
├── go.mod               # module definition (no dependencies)
├── .dockerignore        # keeps the build context small
└── .gitignore
```

---

## Commands cheat sheet

```bash
# Build the image
docker compose build

# Build and run in the foreground (Ctrl+C to stop)
docker compose up --build

# Run detached and check the logs
docker compose up -d
docker compose logs -f

# Stop and remove
docker compose down

# Rebuild from scratch, ignoring the cache
docker compose build --no-cache

# Remove all images built from this project
docker image prune -a
```

---

## Notes and caveats

- **The `scratch` stage has no shell.** You cannot run `docker compose exec web sh`
  to poke around inside the container. That is the trade-off: an image with
  nothing in it has nothing to attack. Use `alpine` as the base of the final
  stage instead if you need a shell for debugging.
- **No `TZ` / locale / CA certificates** come for free in `scratch`. If your
  app needs TLS, copy `/etc/ssl/certs/ca-certificates.crt` in explicitly, or
  use `alpine` and `apk add --no-cache ca-certificates`.
- **The `.dockerignore` file matters.** It keeps `.git`, the markdown files and
  the compose file out of the build context. Without it the whole directory is
  uploaded to the daemon on every build. Context size is shown in the build
  output as `transferring context: 12.34MB`.
- **Layer caching is order-sensitive.** Copying `go.mod` *before* the source
  code means the dependency download is only re-run when the dependencies
  change, not every time you edit `main.go`. Put your most frequently changed
  files last.
- **`STOPSIGNAL SIGTERM`** lets the process handle shutdown gracefully. The Go
  HTTP server has no shutdown handler here, but a real app would use
  `signal.NotifyContext` to stop accepting connections and exit cleanly.
