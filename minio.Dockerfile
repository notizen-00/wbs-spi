# MinIO community distributions are source-only. Keep these tags aligned with
# deploy/windows/Install-Native.ps1 instead of relying on removed registry images.
ARG GO_BASE_IMAGE=public.ecr.aws/docker/library/golang:1.24-alpine
ARG ALPINE_BASE_IMAGE=public.ecr.aws/docker/library/alpine:3.22
FROM ${GO_BASE_IMAGE} AS go-base
RUN apk add --no-cache ca-certificates git
ENV CGO_ENABLED=0 GOMAXPROCS=2 GOBIN=/out

FROM go-base AS server-build
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go install -p 2 -trimpath -ldflags="-s -w" github.com/minio/minio@RELEASE.2025-09-07T16-13-09Z

FROM go-base AS client-build
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go install -p 2 -trimpath -ldflags="-s -w" github.com/minio/mc@RELEASE.2025-08-13T08-35-41Z

FROM ${ALPINE_BASE_IMAGE} AS runtime
RUN apk add --no-cache ca-certificates

FROM runtime AS server
LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.version="RELEASE.2025-09-07T16-13-09Z" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
COPY --from=server-build /out/minio /usr/local/bin/minio
RUN mkdir -p /data
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]

FROM runtime AS client
LABEL org.opencontainers.image.source="https://github.com/minio/mc" \
      org.opencontainers.image.version="RELEASE.2025-08-13T08-35-41Z" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
COPY --from=client-build /out/mc /usr/local/bin/mc
ENTRYPOINT ["/usr/local/bin/mc"]
