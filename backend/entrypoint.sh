#!/usr/bin/env bash
set -e

DB_HOST=${PG_HOST:-db}
DB_PORT=${PG_PORT:-5432}
DB_NAME=${PG_NAME:-acom_db}
DB_USER=${PG_USER:-postgres}

echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT} (db=${DB_NAME}, user=${DB_USER})..."
MAX_RETRIES=60
i=0
until python - <<'PY' > /dev/null 2>&1
import os
import psycopg2

conn = psycopg2.connect(
    host=os.getenv("PG_HOST", "db"),
    port=os.getenv("PG_PORT", "5432"),
    dbname=os.getenv("PG_NAME", "acom_db"),
    user=os.getenv("PG_USER", "postgres"),
    password=os.getenv("PG_PASSWORD", "postgres"),
    connect_timeout=3,
)
conn.close()
PY
do
  i=$((i+1))
  if [ $i -ge $MAX_RETRIES ]; then
    echo "PostgreSQL did not become ready in time."
    exit 1
  fi
  echo "PostgreSQL unavailable, retry ${i}/${MAX_RETRIES}..."
  sleep 2
done

echo "PostgreSQL is ready."

# apply migrations, collect static and create superuser optionally
echo "Running migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

# run the command passed to the container (e.g. gunicorn)
exec "$@"
