/*
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
*/
'use strict';

var gulp = require('gulp');
var tape = require('gulp-tape');
var tapColorize = require('tap-colorize');
var istanbul = require('gulp-istanbul');
var addsrc = require('gulp-add-src');

var fs = require('fs-extra');
var path = require('path');
var os = require('os');
var util = require('util');
var shell = require('gulp-shell');
var testConstants = require('../../test/unit/constants.js');

// by default for running the tests print debug to a file
var debugPath = path.join(testConstants.tempdir, 'test-log/debug.log');
process.env.HFC_LOGGING = util.format('{"debug":"%s"}', debugPath);
console.log('\n####################################################');
console.log(util.format('# debug log: %s', debugPath));
console.log('####################################################\n');

gulp.task('pre-test', function() {
	return gulp.src([
		'node_modules/fabric-client/lib/**/*.js',
		'node_modules/fabric-ca-client/lib/FabricCAClientImpl.js'])
	.pipe(istanbul())
	.pipe(istanbul.hookRequire());
});

gulp.task('docker-clean-node', shell.task([
	// stop and remove chaincode docker instances
	// 'docker kill $(docker ps | grep "^dev-peer0.org[12].example.com" | awk \'{print $1}\')',
	'docker rm -f $(docker ps -aq)',

	// remove chaincode images so that they get rebuilt during test
	'docker rmi $(docker images | grep "^dev-peer0.org[12].example.com" | awk \'{print $3}\')',

	// clean up all the containers created by docker-compose
	'docker-compose -f test/fixtures/docker-compose.yaml down'
], {
	verbose: true, // so we can see the docker command output
	ignoreErrors: true // kill and rm may fail because the containers may have been cleaned up
}));

gulp.task('docker-ready-node', ['docker-clean-node'], shell.task([
	// make sure that necessary containers are up by docker-compose
	'docker-compose -f test/fixtures/docker-compose.yaml up -d'
]));

gulp.task('test-node', ['clean-up', 'pre-test', 'docker-ready-node', 'ca'], function() {
	// use individual tests to control the sequence they get executed
	// first run the ca-tests that tests all the member registration
	// and enrollment scenarios (good and bad calls). Then the rest
	// of the tests will re-use the same key value store that has
	// saved the user certificates so they can interact with the
	// network
	return gulp.src(shouldRunPKCS11Tests([
		'test/integration/nodechaincode/e2e.js'
	]))
	.pipe(tape({
		reporter: tapColorize()
	}))
	.pipe(istanbul.writeReports({
		reporters: ['lcov', 'json', 'text',
			'text-summary', 'cobertura']
	}));
});

// currently only the x64 CI jobs are configured with SoftHSM
// disable the pkcs11.js test for s390 or other jobs
// also skip it by default and allow it to be turned on manuall
// with an environment variable so everyone don't have to
// install SoftHsm just to run unit tests
function shouldRunPKCS11Tests(tests) {
	if (os.arch().match(/(x64|x86)/) === null ||
		!(typeof process.env.PKCS11_TESTS === 'string' && process.env.PKCS11_TESTS.toLowerCase() == 'true')) {
		tests.push('!test/unit/pkcs11.js');
	}

	return tests;
}
