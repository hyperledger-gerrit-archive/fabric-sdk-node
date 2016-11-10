'use strict';

var gutil = require('gulp-util');
var exec = require('child_process').exec;
var gulp = require('gulp');
var tape = require('gulp-tape');
var tapColorize = require('tap-colorize');
var istanbul = require('gulp-istanbul');

gulp.task('pre-test', function() {
	return gulp.src(['lib/**/*.js'])
		.pipe(istanbul())
		.pipe(istanbul.hookRequire());
});

gulp.task('test', ['pre-test'], function() {
	// use individual tests to control the sequence they get executed
	// first run the ca-tests that tests all the member registration and
	// enrollment scenarios (good and bad calls). then the rest of the
	// tests will re-used the same key value store that has saved the
	// user certificates so they can interact with the network
	return gulp.src(['test/unit/ca-tests.js', 'test/unit/endorser-tests.js', 'test/unit/orderer-tests.js', 'test/unit/orderer-member-tests.js', 'test/unit/end-to-end.js', 'test/unit/headless-tests.js'])
		.pipe(tape({
			reporter: tapColorize()
		}))
		.pipe(istanbul.writeReports());
});

gulp.task('test-headless', ['pre-test'], function() {
	return gulp.src('test/unit/headless-tests.js')
		.pipe(tape({
			reporter: tapColorize()
		}))
		.pipe(istanbul.writeReports());
});




gulp.task('remove_keystore', function(cb) {
	gutil.log('Removing keystores');
	exec('node test/unit/removeKeystores.js', function(err, stdout, stderr) {
		console.log(stdout);
		console.log(stderr);
		cb(err);
	});
});

gulp.task('fabricStop', ['remove_keystore'], function(cb) {
	gutil.log('Stopping Fabric');
	exec('node test/unit/stopFabric.js', function(err, stdout, stderr) {
		console.log(stdout);
		console.log(stderr);
		cb(err);
	});
});

gulp.task('cleanup', ['remove_keystore', 'fabricStop']);

gulp.task('fabricStart', ['cleanup'], function(cb) {
	gutil.log('Starting Fabric');
	exec('node test/unit/startFabric.js', function(err, stdout, stderr) {
		console.log(stdout);
		console.log(stderr);
		cb(err);
	});
});

gulp.task('unit_tests', ['fabricStart'], function(cb) {
	gutil.log('Executing tests');
	exec('node test/index.js', function(err, stdout, stderr) {
		console.log(stdout);
		console.log(stderr);
		cb(err);
	});
});

gulp.task('default', ['test']);
