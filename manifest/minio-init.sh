#!/bin/sh
set -eu

case "$MINIO_BUCKET" in ''|*[!a-z0-9.-]*) echo 'Invalid MinIO bucket name.' >&2; exit 1;; esac

attempt=0
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then echo 'MinIO is not ready or root credentials are invalid.' >&2; exit 1; fi
  sleep 2
done

mc mb --ignore-existing "local/$MINIO_BUCKET" >/dev/null
mc anonymous set none "local/$MINIO_BUCKET" >/dev/null

# Existing development deployments may use the root account as the application account.
if [ "$MINIO_ACCESS_KEY" != "$MINIO_ROOT_USER" ]; then
  cat > /tmp/wbs-evidence-policy.json <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket"],"Resource":["arn:aws:s3:::$MINIO_BUCKET"]},{"Effect":"Allow","Action":["s3:PutObject","s3:GetObject"],"Resource":["arn:aws:s3:::$MINIO_BUCKET/quarantine/*"]}]}
EOF
  mc admin user add local "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
  mc admin policy create local wbs-evidence /tmp/wbs-evidence-policy.json >/dev/null
  mc admin policy attach local wbs-evidence --user "$MINIO_ACCESS_KEY" >/dev/null
  rm -f /tmp/wbs-evidence-policy.json
fi

echo 'MinIO private bucket and application access are ready.'
