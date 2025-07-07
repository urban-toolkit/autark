.PHONY: dev

CONCURRENTLY := npx concurrently
RIMRAF := npx rimraf

install:
	$(CONCURRENTLY) "cd utkmap && npm install" "cd utkdb && npm install" "cd utkplot && npm install" "cd examples && npm install"

dev:
	$(CONCURRENTLY) \
		"cd utkmap && npm run dev-build" \
		"cd utkdb && npm run dev-build" \
		"cd utkplot && npm run dev-build" \
		"sleep 10 && cd examples && npm run dev"
map:
	$(CONCURRENTLY) "cd utkmap && npm run build"

db:
	$(CONCURRENTLY) "cd utkdb && npm run build"

plot:
	$(CONCURRENTLY) "cd utkplot && npm run build"

examples:
	$(CONCURRENTLY) "cd examples && npm run dev"

clean:
	$(CONCURRENTLY) \
		"cd utkmap && $(RIMRAF) dist build node_modules" \
		"cd utkdb && $(RIMRAF) dist build node_modules" \
		"cd utkplot && $(RIMRAF) dist build node_modules" \
		"cd examples && $(RIMRAF) dist build node_modules"

publish:
	@if [ -z "$(LIB)" ]; then \
		echo "Error: Please specify a library to publish using LIB=<library>"; \
		echo "Usage: make publish LIB=utkmap|utkdb|utkplot"; \
		exit 1; \
	fi
	@if [ "$(LIB)" != "utkmap" ] && [ "$(LIB)" != "utkdb" ] && [ "$(LIB)" != "utkplot" ]; then \
		echo "Error: LIB must be one of: utkmap, utkdb, utkplot"; \
		exit 1; \
	fi
	cd $(LIB) && npm pack && npm publish *.tgz