# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: builder
# The full Go toolchain is only needed to compile the source. Everything this
# stage installs is discarded once it copies the finished binary out, so none
# of it ends up in the final image.
# ---------------------------------------------------------------------------
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
#   CGO_ENABLED=0  -> no libc dependency, so the binary runs on a bare image
#   -trimpath      -> strip local filesystem paths from the binary
#   -ldflags "-s -w" -> strip the symbol table and DWARF debug info (smaller)
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/app .

# ---------------------------------------------------------------------------
# Stage 2: runtime
# Only the compiled binary is carried over. The Go toolchain, module cache and
# source code from stage 1 are left behind.
# ---------------------------------------------------------------------------
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
