.PHONY: dev

CONCURRENTLY := npx concurrently
RIMRAF := npx rimraf

install:
	$(CONCURRENTLY) "cd utkmap && npm install" "cd utkdb && npm install" "cd utkplot && npm install" "cd demo && npm install"

dev:
	$(CONCURRENTLY) \
		"cd utkmap && npm run dev-build" \
		"cd utkdb && npm run dev-build" \
		"cd utkplot && npm run dev-build" \
		"sleep 10 && cd demo && npm run dev"
map:
	$(CONCURRENTLY) "cd utkmap && npm run build"

db:
	$(CONCURRENTLY) "cd utkdb && npm run build"

plot:
	$(CONCURRENTLY) "cd utkplot && npm run build"

demo:
	$(CONCURRENTLY) "cd demo && npm run dev"

clean:
	$(CONCURRENTLY) \
		"cd utkmap && $(RIMRAF) dist build node_modules" \
		"cd utkdb && $(RIMRAF) dist build node_modules" \
		"cd utkplot && $(RIMRAF) dist build node_modules" \
		"cd demo && $(RIMRAF) dist build node_modules"