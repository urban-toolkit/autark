.PHONY: dev

CONCURRENTLY := npx concurrently
RIMRAF := npx rimraf

install:
	$(CONCURRENTLY) "cd autk-map && npm install" "cd autk-db && npm install" "cd autk-plot && npm install" "cd autk-compute && npm install" "cd autk-grammar && npm install" "cd autk-grammar-db && npm install"

install-ex:
	cd examples && npm install

build:
	$(CONCURRENTLY) \
		"cd autk-map && npm run build" \
		"cd autk-db && npm run build" \
		"cd autk-plot && npm run build" \
		"cd autk-compute && npm run build" \
		"cd autk-grammar && npm run build" \
		"cd autk-grammar-db && npm run build"

dev:
	make install-ex
	make build
	$(CONCURRENTLY) \
		"cd autk-map && npm run dev-build" \
		"cd autk-db && npm run dev-build" \
		"cd autk-plot && npm run dev-build" \
		"cd autk-compute && npm run dev-build" \
		"cd autk-grammar && npm run dev-build" \
		"cd autk-grammar-db && npm run dev-build" \
		"cd examples && npm run dev"

map:
	$(CONCURRENTLY) "cd autk-map && npm run build"

db:
	$(CONCURRENTLY) "cd autk-db && npm run build"

plot:
	$(CONCURRENTLY) "cd autk-plot && npm run build"

compute:
	$(CONCURRENTLY) "cd autk-compute && npm run build"

grammar:
	$(CONCURRENTLY) "cd autk-grammar && npm run build"

grammardb:
	$(CONCURRENTLY) "cd autk-grammar-db && npm run build"

examples:
	$(CONCURRENTLY) "cd examples && npm run dev"

clean:
	$(CONCURRENTLY) \
		"cd autk-map && $(RIMRAF) dist build node_modules" \
		"cd autk-db && $(RIMRAF) dist build node_modules" \
		"cd autk-plot && $(RIMRAF) dist build node_modules" \
		"cd autk-compute && $(RIMRAF) dist build node_modules" \
		"cd autk-grammar && $(RIMRAF) dist build node_modules" \
		"cd autk-grammar-db && $(RIMRAF) dist build node_modules" \
		"cd examples && $(RIMRAF) dist build node_modules"

publish:
	@if [ -z "$(LIB)" ]; then \
		echo "Error: Please specify a library to publish using LIB=<library>"; \
		echo "Usage: make publish LIB=autk-map|autk-db|autk-plot|autk-compute|autk-grammar|autk-grammar-db"; \
		exit 1; \
	fi
	@if [ "$(LIB)" != "autk-map" ] && [ "$(LIB)" != "autk-db" ] && [ "$(LIB)" != "autk-plot" ] && [ "$(LIB)" != "autk-compute" ] && [ "$(LIB)" != "autk-grammar" ] && [ "$(LIB)" != "autk-grammar-db" ]; then \
		echo "Error: LIB must be one of: autk-map, autk-db, autk-plot, autk-compute, autk-grammar, autk-grammar-db"; \
		exit 1; \
	fi
	cd $(LIB) && npm pack && npm publish *.tgz