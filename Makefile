.PHONY: lint test typecheck build package-validate docs verify dev gallery usecases benchmark benchmark-views benchmark-synthetic benchmark-spatialbench clean

CONCURRENTLY := npx concurrently
RIMRAF := npx rimraf

APP ?= gallery

lint:
	npm run lint

test:
	npm test

typecheck: build
	$(CONCURRENTLY) \
		"cd autk-core && npx tsc --noEmit --skipLibCheck" \
		"cd autk-map && npx tsc --noEmit --skipLibCheck" \
		"cd autk-db && npx tsc --noEmit --skipLibCheck" \
		"cd autk-plot && npx tsc --noEmit --skipLibCheck" \
		"cd autk-compute && npx tsc --noEmit --skipLibCheck" \
		"cd autk && npx tsc --noEmit --skipLibCheck" \
		"cd gallery && npx tsc --noEmit --skipLibCheck" \
		"cd usecases && npx tsc --noEmit --skipLibCheck" \
		"cd benchmark && npx tsc --noEmit --skipLibCheck"

build:
	cd autk-core && npm run build
	$(CONCURRENTLY) \
		"cd autk-map && npm run build" \
		"cd autk-db && npm run build" \
		"cd autk-plot && npm run build" \
		"cd autk-compute && npm run build"
	cd autk && npm run build

package-validate: build
	npm run validate:packages

docs:
	$(CONCURRENTLY) \
		"cd autk-core && npm run doc" \
		"cd autk-map && npm run doc" \
		"cd autk-db && npm run doc" \
		"cd autk-plot && npm run doc" \
		"cd autk-compute && npm run doc"

verify: lint test typecheck

dev:
	npm install
	make build
	$(CONCURRENTLY) \
		"cd autk-core && npm run dev-build" \
		"cd autk-map && npm run dev-build" \
		"cd autk-db && npm run dev-build" \
		"cd autk-plot && npm run dev-build" \
		"cd autk-compute && npm run dev-build" \
		"cd autk && npm run dev-build" \
		"cd $(APP) && npm run dev$(if $(OPEN), -- --open=$(OPEN))"

gallery:
	$(MAKE) dev APP=gallery$(if $(OPEN), OPEN=$(OPEN))

usecases:
	$(MAKE) dev APP=usecases$(if $(OPEN), OPEN=$(OPEN))

benchmark: build
	cd benchmark && npx playwright test

benchmark-views: build
	cd benchmark && npx playwright test tests/views.spec.ts

benchmark-synthetic: build
	cd benchmark && npx playwright test tests/synthetic-scaling.spec.ts

benchmark-spatialbench: build
	cd benchmark && npx playwright test tests/spatialbench.spec.ts

clean:
	$(RIMRAF) node_modules package-lock.json
	$(CONCURRENTLY) \
		"cd autk-core && $(RIMRAF) dist build node_modules" \
		"cd autk-map && $(RIMRAF) dist build node_modules" \
		"cd autk-db && $(RIMRAF) dist build node_modules" \
		"cd autk-plot && $(RIMRAF) dist build node_modules" \
		"cd autk-compute && $(RIMRAF) dist build node_modules" \
		"cd autk && $(RIMRAF) dist build node_modules" \
		"cd gallery && $(RIMRAF) dist build node_modules" \
		"cd usecases && $(RIMRAF) dist build node_modules" \
		"cd benchmark && $(RIMRAF) dist build node_modules results"
