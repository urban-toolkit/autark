.PHONY: dev

CONCURRENTLY := npx concurrently
RIMRAF := npx rimraf

install:
	$(CONCURRENTLY) "cd autk-map && npm install" "cd autk-db && npm install" "cd autk-plot && npm install" "cd examples && npm install"

build:
	$(CONCURRENTLY) \
		"cd autk-map && npm run build" \
		"cd autk-db && npm run build" \
		"cd autk-plot && npm run build"

dev:
	$(CONCURRENTLY) \
		"cd autk-map && npm run dev-build" \
		"cd autk-db && npm run dev-build" \
		"cd autk-plot && npm run dev-build" \
		"sleep 10 && cd examples && npm run dev"
map:
	$(CONCURRENTLY) "cd autk-map && npm run build"

db:
	$(CONCURRENTLY) "cd autk-db && npm run build"

plot:
	$(CONCURRENTLY) "cd autk-plot && npm run build"

examples:
	$(CONCURRENTLY) "cd examples && npm run dev"

clean:
	$(CONCURRENTLY) \
		"cd autk-map && $(RIMRAF) dist build node_modules" \
		"cd autk-db && $(RIMRAF) dist build node_modules" \
		"cd autk-plot && $(RIMRAF) dist build node_modules" \
		"cd examples && $(RIMRAF) dist build node_modules"

publish:
	@if [ -z "$(LIB)" ]; then \
		echo "Error: Please specify a library to publish using LIB=<library>"; \
		echo "Usage: make publish LIB=autk-map|autk-db|autk-plot"; \
		exit 1; \
	fi
	@if [ "$(LIB)" != "autk-map" ] && [ "$(LIB)" != "autk-db" ] && [ "$(LIB)" != "autk-plot" ]; then \
		echo "Error: LIB must be one of: autk-map, autk-db, autk-plot"; \
		exit 1; \
	fi
	cd $(LIB) && npm pack && npm publish *.tgz