.PHONY: dev

CONCURRENTLY := npx concurrently

install:
	$(CONCURRENTLY) "cd utkmap && npm install" "cd utkdb && npm install" "cd demo && npm install"

dev:
	$(CONCURRENTLY) "cd utkmap && npm run dev-build" "cd utkdb && npm run dev-build" "cd demo && npm run dev"