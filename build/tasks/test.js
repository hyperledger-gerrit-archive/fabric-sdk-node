'use strict';

var gulp = require('gulp');
var tape = require('gulp-tape');
var tapColorize = require('tap-colorize');
var istanbul = require('gulp-istanbul');

gulp.task('pre-test', function() {
	return gulp.src([
		'node_modules/fabric-client/lib/**/*.js',
		'node_modules/fabric-ca-client/lib/FabricCAClientImpl.js'])
	.pipe(istanbul())
	.pipe(istanbul.hookRequire());
});

gulp.task('test', ['pre-test'], function() {
	// use individual tests to control the sequence they get executed
	// first run the ca-tests that tests all the member registration and
	// enrollment scenarios (good and bad calls). then the rest of the
	// tests will re-used the same key value store that has saved the
	// user certificates so they can interact with the network
	return gulp.src([
		// 'test/unit/ca-tests.js',
		'test/unit/chain-fabriccop-tests.js',
		'test/unit/endorser-tests.js',
		'test/unit/orderer-tests.js',
		'test/unit/orderer-chain-tests.js',
		'test/unit/end-to-end.js',
		'test/unit/headless-tests.js'
	])
	.pipe(tape({
		reporter: tapColorize()
	}))
	.pipe(istanbul.writeReports());
});

gulp.task('test-headless', ['pre-test'], function() {
	// this is needed to avoid a problem in tape-promise with adding too many listeners
	// to the "unhandledRejection" event
	process.setMaxListeners(0);

	return gulp.src([
		'test/unit/**/*.js',
		'!test/unit/util.js'
	])
	.pipe(tape({
		reporter: tapColorize()
	}))
	.pipe(istanbul.writeReports());
});
