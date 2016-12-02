'use strict';

var gutil = require('gulp-util');
var exec = require('child_process').exec;
var gulp = require('gulp');
var tape = require('gulp-tape');
var tapColorize = require('tap-colorize');
var istanbul = require('gulp-istanbul');
var path = require('path');
var Fabric = require('../../test/lib/Fabric.js');


gulp.task('pre-test', function() {
	return gulp.src(['hfc/lib/**/*.js','hfc-cop/lib/**/*.js'])
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
		'test/unit/orderer-member-tests.js',
		'test/unit/end-to-end.js',
		'test/unit/headless-tests.js'
	])
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

gulp.task('remove-keystores', ['fabric-stop'], function(cb) {
	var action = require('../../test/lib/removeKeystores.js');
	action.removeKeyStores();
	cb();
});

/**
 *  Utility method to start the fabric network
 *
 *  May be called with the two arguments
 * --cwd current working directory
 * --dcf docker compose file location
 *
 */
gulp.task('fabric-start', ['fabric-cleanup'], function(cb) {
	var current_working_directory = path.join(__dirname, '../../test/fixtures');
	var i = process.argv.indexOf('--cwd');
	if(i>-1) {
		current_working_directory = process.argv[i+1];
	}
	var docker_compose_file = './docker-compose.yml';
	var j = process.argv.indexOf('--dcf');
	if(j>-1) {
		docker_compose_file = process.argv[j+1];
	}

	var fabric_network = new Fabric();
	fabric_network.start(current_working_directory, docker_compose_file).
		then(function(net) {
			var error;
			console.log('start output[0] ::'+ net.output[0]);
			console.log('start output[1] ::'+ net.output[1]);
			console.log('start output[2] ::'+ net.output[2]);
			if(net.status == 0) {
				gutil.log('*** fabric network started successfully\n');
			} else {
				gutil.log('fabric network not started successfully status='+net.status);
				error = net.status;
			}
			cb(error);
		}).
		catch(function(err) {
			gutil.log('fabric network not started successfully err='+ err.stack ? err.stack : err);
			cb(err);
		}
	);
});

gulp.task('fabric-cleanup', ['fabric-stop', 'remove-keystores']);

/**
 *  Utility method to stop the fabric network
 *
 *  May be called with the two named arguments
 * --cwd current working directory
 * --dcf docker compose file name in current working directory
 *
 */
gulp.task('fabric-stop', ['pre-test'], function(cb) {
	var current_working_directory = path.join(__dirname, '../../test/fixtures');
	var i = process.argv.indexOf('--cwd');
	if(i>-1) {
		current_working_directory = process.argv[i+1];
	}
	var docker_compose_file = 'docker-compose.yml';
	var j = process.argv.indexOf('--dcf');
	if(j>-1) {
		docker_compose_file = process.argv[j+1];
	}
	var fabric_network = new Fabric();
	fabric_network.stop(current_working_directory, docker_compose_file)
	.then(function(net) {
		var error;
		console.log('stop output[0] ::'+ net.output[0]);
		console.log('stop output[1] ::'+ net.output[1]);
		console.log('stop output[2] ::'+ net.output[2]);
		if(net.status == 0) {
			gutil.log('*** fabric network stopped successfully\n');
		} else {
			gutil.log('fabric network not stopped successfully status='+net.status);
			error = net.status;
		}
		cb(error);
	})
	.catch(function(err) {
		gutil.log('fabric network not stopped successfully err='+ err.stack ? err.stack : err);
		cb(err);
	});
});

gulp.task('unit-tests', ['fabric-start'], function(cb) {
	gutil.log('Executing tests');
	var error;
	exec('node test/index.js', function(err, stdout, stderr) {
		console.log(stdout);
		console.log(stderr);
		error = err;
	});
	cb(error);
});

gulp.task('default', ['test']);
