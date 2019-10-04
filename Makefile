REPORTER = dot

test:
	@./node_modules/.bin/jasmine

test-cov:
	@./node_modules/.bin/istanbul cover ./node_modules/.bin/jasmine

clean:
	rm -rf node_modules
	rm -rf coverage
	rm -rf lib

.PHONY: test
