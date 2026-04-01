.PHONY: dev

CONCURRENTLY := npx concurrently
RIMRAF := npx rimraf

APP ?= gallery

install:
	npm install

build:
	$(CONCURRENTLY) \
		"cd autk-map && npm run build" \
		"cd autk-db && npm run build" \
		"cd autk-plot && npm run build" \
		"cd autk-compute && npm run build"


dev:
	make install
	make build
	$(CONCURRENTLY) \
		"cd autk-map && npm run dev-build" \
		"cd autk-db && npm run dev-build" \
		"cd autk-plot && npm run dev-build" \
		"cd autk-compute && npm run dev-build" \
		"cd $(APP) && VITE_OPEN=\"$(OPEN)\" npm run dev"

map:
	cd autk-map && npm run build

db:
	cd autk-db && npm run build

plot:
	cd autk-plot && npm run build

compute:
	cd autk-compute && npm run build


clean:
	$(RIMRAF) node_modules
	$(CONCURRENTLY) \
		"cd autk-map && $(RIMRAF) dist build" \
		"cd autk-db && $(RIMRAF) dist build" \
		"cd autk-plot && $(RIMRAF) dist build" \
		"cd autk-compute && $(RIMRAF) dist build" \
		"cd gallery && $(RIMRAF) dist build" \
		"cd usecases && $(RIMRAF) dist build" \
		"cd performance && $(RIMRAF) dist build"

publish:
	@if [ -z "$(LIB)" ]; then \
		echo "Error: Please specify a library to publish using LIB=<library>"; \
		echo "Usage: make publish LIB=autk-map|autk-db|autk-plot|autk-compute"; \
		exit 1; \
	fi
	@if [ "$(LIB)" != "autk-map" ] && [ "$(LIB)" != "autk-db" ] && [ "$(LIB)" != "autk-plot" ] && [ "$(LIB)" != "autk-compute" ]; then \
		echo "Error: LIB must be one of: autk-map, autk-db, autk-plot, autk-compute"; \
		exit 1; \
	fi
	cd $(LIB) && npm pack && npm publish *.tgz
