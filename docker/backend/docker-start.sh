#!/bin/sh
set -eu

echo "[backend] Migração..."
npm run db:migrate

echo "[backend] Seed..."
npm run db:seed

echo "[backend] API..."
exec npm start
