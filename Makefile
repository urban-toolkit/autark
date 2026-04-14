.PHONY: dev

CONCURRENTLY := npx concurrently
RIMRAF := npx rimraf

APP ?= examples

install:
	$(CONCURRENTLY) "cd autk-map && npm install" "cd autk-db && npm install" "cd autk-plot && npm install" "cd autk-compute && npm install"  "cd urban-grammar && npm install" "cd autk-grammar && npm install"

install-app:
	cd $(APP) && npm install



build:
	$(CONCURRENTLY) \
		"cd autk-map && npm run build" \
		"cd autk-db && npm run build" \
		"cd autk-plot && npm run build" \
		"cd autk-compute && npm run build" \
		"cd urban-grammar && npm run build"
	cd autk-grammar && npm run build

dev:
	make install
	make install-app
	make build
	$(CONCURRENTLY) \
		"cd autk-map && npm run dev-build" \
		"cd autk-db && npm run dev-build" \
		"cd autk-plot && npm run dev-build" \
		"cd autk-compute && npm run dev-build" \
		"cd urban-grammar && npm run dev-build" \
		"cd autk-grammar && npm run dev-build" \
		"cd $(APP) && npm run dev"

map:
	$(CONCURRENTLY) "cd autk-map && npm run build"

db:
	$(CONCURRENTLY) "cd autk-db && npm run build"

plot:
	$(CONCURRENTLY) "cd autk-plot && npm run build"

compute:
	$(CONCURRENTLY) "cd autk-compute && npm run build"

grammar:
	$(CONCURRENTLY) "cd urban-grammar && npm run build"

grammardb:
	$(CONCURRENTLY) "cd autk-grammar && npm run build"

clean:
	$(CONCURRENTLY) \
		"cd autk-map && $(RIMRAF) dist build node_modules" \
		"cd autk-db && $(RIMRAF) dist build node_modules" \
		"cd autk-plot && $(RIMRAF) dist build node_modules" \
		"cd autk-compute && $(RIMRAF) dist build node_modules" \
		"cd urban-grammar && $(RIMRAF) dist build node_modules" \
		"cd autk-grammar && $(RIMRAF) dist build node_modules" \
		"cd examples && $(RIMRAF) dist build node_modules" \
		"cd case-studies && $(RIMRAF) dist build node_modules"

publish:
	@if [ -z "$(LIB)" ]; then \
		echo "Error: Please specify a library to publish using LIB=<library>"; \
		echo "Usage: make publish LIB=autk-map|autk-db|autk-plot|autk-compute|urban-grammar|autk-grammar"; \
		exit 1; \
	fi
	@if [ "$(LIB)" != "autk-map" ] && [ "$(LIB)" != "autk-db" ] && [ "$(LIB)" != "autk-plot" ] && [ "$(LIB)" != "autk-compute" ] && [ "$(LIB)" != "urban-grammar" ] && [ "$(LIB)" != "autk-grammar" ]; then \
		echo "Error: LIB must be one of: autk-map, autk-db, autk-plot, autk-compute, urban-grammar, autk-grammar"; \
		exit 1; \
	fi
	cd $(LIB) && npm pack && npm publish *.tgz