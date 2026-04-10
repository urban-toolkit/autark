.PHONY: install lint typecheck build build-all docs verify test test-update test-ui test-codegen dev map db plot compute clean publish

CONCURRENTLY := npx concurrently
RIMRAF := npx rimraf

APP ?= gallery

LIB_PACKAGES := autk-map autk-db autk-plot autk-compute
DOC_PACKAGES := $(LIB_PACKAGES)

lint:
	npm run lint

typecheck:
	$(CONCURRENTLY) \
		"cd autk-core && npx tsc --noEmit --skipLibCheck" \
		"cd autk-map && npx tsc --noEmit --skipLibCheck" \
		"cd autk-db && npx tsc --noEmit --skipLibCheck" \
		"cd autk-plot && npx tsc --noEmit --skipLibCheck" \
		"cd autk-compute && npx tsc --noEmit --skipLibCheck" \
		"cd gallery && npx tsc --noEmit --skipLibCheck" \
		"cd usecases && npx tsc --noEmit --skipLibCheck"

build:
	$(CONCURRENTLY) \
		"cd autk-map && npm run build" \
		"cd autk-db && npm run build" \
		"cd autk-plot && npm run build" \
		"cd autk-compute && npm run build"

build-all:
	$(CONCURRENTLY) \
		"cd autk-map && npm run build" \
		"cd autk-db && npm run build" \
		"cd autk-plot && npm run build" \
		"cd autk-compute && npm run build"

docs:
	$(CONCURRENTLY) \
		"cd autk-map && npm run doc" \
		"cd autk-db && npm run doc" \
		"cd autk-plot && npm run doc" \
		"cd autk-compute && npm run doc"

verify: lint typecheck build-all docs

test:
	APP=$(APP) OPEN=$(OPEN) npx playwright test tests/$(APP)

test-update:
	APP=$(APP) OPEN=$(OPEN) npx playwright test tests/$(APP) --update-snapshots

test-ui:
	APP=$(APP) OPEN=$(OPEN) npx playwright test --ui tests/$(APP)

test-codegen:
	node playwright.codegen.mjs http://localhost:5173$(OPEN)$(if $(OPEN), tests/$(APP)/$(shell echo '$(OPEN)' | sed 's|^/||' | sed 's|^src/||' | sed 's|/$$||' | sed 's|\.[^./]*$$||').test.ts)


dev:
	npm install
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
