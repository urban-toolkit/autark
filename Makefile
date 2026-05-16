.PHONY: lint typecheck build docs verify test test-update dev clean

CONCURRENTLY := npx concurrently
RIMRAF := npx rimraf

APP ?= gallery
TEST ?= tests/gallery/autk-map/colormap-categorical.test.ts
UPDATE ?= cache images

lint:
	npm run lint

typecheck: build
	$(CONCURRENTLY) \
		"cd autk-core && npx tsc --noEmit --skipLibCheck" \
		"cd autk-map && npx tsc --noEmit --skipLibCheck" \
		"cd autk-db && npx tsc --noEmit --skipLibCheck" \
		"cd autk-plot && npx tsc --noEmit --skipLibCheck" \
		"cd autk-compute && npx tsc --noEmit --skipLibCheck" \
		"cd autk && npx tsc --noEmit --skipLibCheck" \
		"cd gallery && npx tsc --noEmit --skipLibCheck" \
		"cd usecases && npx tsc --noEmit --skipLibCheck"

build:
	$(CONCURRENTLY) \
		"cd autk-map && npm run build" \
		"cd autk-db && npm run build" \
		"cd autk-plot && npm run build" \
		"cd autk-compute && npm run build"
	cd autk && npm run build

docs:
	$(CONCURRENTLY) \
		"cd autk-map && npm run doc" \
		"cd autk-db && npm run doc" \
		"cd autk-plot && npm run doc" \
		"cd autk-compute && npm run doc"

verify: lint typecheck

test:
	APP=$(APP) npx playwright test $(TEST)

# Update committed test baselines locally.
# Examples:
#   make test-update TEST=tests/gallery/autk-map/colormap-categorical.test.ts UPDATE=images
#   make test-update TEST=tests/gallery/autk-map/osm-layers-api.test.ts UPDATE="cache images"
test-update:
	APP=$(APP) \
	$(if $(findstring cache,$(UPDATE)),HAR_UPDATE=1) \
	npx playwright test $(TEST) \
	$(if $(findstring images,$(UPDATE)),--update-snapshots)

dev:
	npm install
	make build
	$(CONCURRENTLY) \
		"cd autk-map && npm run dev-build" \
		"cd autk-db && npm run dev-build" \
		"cd autk-plot && npm run dev-build" \
		"cd autk-compute && npm run dev-build" \
		"cd autk && npm run dev-build" \
		"cd $(APP) && VITE_OPEN=\"$(OPEN)\" npm run dev"

clean:
	$(RIMRAF) node_modules
	$(CONCURRENTLY) \
		"cd autk-core && $(RIMRAF) dist build node_modules" \
		"cd autk-map && $(RIMRAF) dist build node_modules" \
		"cd autk-db && $(RIMRAF) dist build node_modules" \
		"cd autk-plot && $(RIMRAF) dist build node_modules" \
		"cd autk-compute && $(RIMRAF) dist build node_modules" \
		"cd autk && $(RIMRAF) dist build node_modules" \
		"cd gallery && $(RIMRAF) dist build node_modules" \
		"cd usecases && $(RIMRAF) dist build node_modules"
