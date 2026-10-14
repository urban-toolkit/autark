.PHONY: lint test typecheck build package-validate docs verify dev gallery usecases clean

CONCURRENTLY := ./node_modules/.bin/concurrently

APP ?= gallery

lint:
	npm run lint

test:
	npm test

typecheck: build
	$(CONCURRENTLY) \
		"cd autk-core && ../node_modules/.bin/tsc --noEmit --skipLibCheck" \
		"cd autk-map && ../node_modules/.bin/tsc --noEmit --skipLibCheck" \
		"cd autk-db && ../node_modules/.bin/tsc --noEmit --skipLibCheck" \
		"cd autk-plot && ../node_modules/.bin/tsc --noEmit --skipLibCheck" \
		"cd autk-compute && ../node_modules/.bin/tsc --noEmit --skipLibCheck" \
		"cd autk && ../node_modules/.bin/tsc --noEmit --skipLibCheck" \
		"cd gallery && ../node_modules/.bin/tsc --noEmit --skipLibCheck" \
		"cd usecases && ../node_modules/.bin/tsc --noEmit --skipLibCheck"

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
	npm run validate:packages

dev:
	npm ci
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

clean:
	rm -rf $(foreach package,autk-core autk-map autk-db autk-plot autk-compute autk gallery usecases,$(addprefix $(package)/,dist build node_modules)) node_modules
