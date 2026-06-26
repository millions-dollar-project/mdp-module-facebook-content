// Command migrate runs the SQL migrations against $DATABASE_URL.
//
// Usage:
//
//	go run ./cmd/migrate up      # apply all pending
//	go run ./cmd/migrate down    # reverse all (dev only)
//	go run ./cmd/migrate version # print current version
package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/db"
)

func main() {
	// Best-effort load of .env (matches cmd/server behaviour). In a
	// container/deploy environment, the env is already set and the
	// missing .env is silently ignored.
	_ = godotenv.Load()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}
	cmd := "up"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	var err error
	switch cmd {
	case "up":
		err = db.RunMigrationsUp(dsn, nil)
	case "down":
		err = db.RunMigrationsDown(dsn, nil)
	case "version":
		fmt.Println("(version not exposed via iofs; check schema_migrations table)")
		return
	default:
		log.Fatalf("unknown command: %s (use up|down|version)", cmd)
	}
	if err != nil {
		log.Fatalf("migrate %s: %v", cmd, err)
	}
	fmt.Printf("migrate %s: ok\n", cmd)
}
