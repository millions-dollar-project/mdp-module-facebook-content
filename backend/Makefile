.PHONY: db-up db-down migrate-up migrate-down sqlc run build test lint tidy

DB_URL ?= postgres://facebook:facebook@localhost:5433/facebook?sslmode=disable

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

migrate-up:
	@test -n "$$DATABASE_URL" || DATABASE_URL="$(DB_URL)" go run ./cmd/migrate up

migrate-down:
	@test -n "$$DATABASE_URL" || DATABASE_URL="$(DB_URL)" go run ./cmd/migrate down

# sqlc must be installed: `go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`
sqlc:
	sqlc generate

run:
	go run ./cmd/server

build:
	go build -o bin/server ./cmd/server
	go build -o bin/migrate ./cmd/migrate

test:
	go test ./...

lint:
	go vet ./...

tidy:
	go mod tidy
