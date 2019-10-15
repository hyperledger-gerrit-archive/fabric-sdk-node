
/*
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
*/

/* eslint-disable no-console */

'use strict';

const gulp = require('gulp');
const mocha = require('gulp-mocha');
const tape = require('gulp-tape');
const runSequence = require('run-sequence');
const tapColorize = require('tap-colorize');

const fs = require('fs-extra');
const path = require('path');
const util = require('util');
const shell = require('gulp-shell');
const tapeUtil = require('../../test/unit/util.js');

// Debug level of Docker containers used in scenario tests
process.env.DOCKER_DEBUG = 'INFO';

// by default for running the tests print debug to a file
const debugPath = path.join(tapeUtil.getTempDir(), 'debug.log');
process.env.HFC_LOGGING = util.format('{"debug":"%s"}', escapeWindowsPath(debugPath));
// by default for running the tests print debug to a file
const debugCPath = path.join(tapeUtil.getTempDir(), 'debugc.log');
const cucumber_log = util.format('{"debug":"%s"}', escapeWindowsPath(debugCPath));

function escapeWindowsPath(p) {
	if (path.sep === '/') {
		return p;
	}
	return p.replace(/\\/g, '\\\\');
}

console.log('\n####################################################');
console.log(util.format('# debug log: %s', debugPath));
console.log('####################################################\n');

const arch = process.arch;
const release = require(path.join(__dirname, '../../package.json')).testFabricVersion;
const thirdparty_release = require(path.join(__dirname, '../../package.json')).testFabricThirdParty;
let dockerImageTag = '';
let thirdpartyImageTag = '';
let docker_arch = '';

// this is a release build, need to build the proper docker image tag
// to run the tests against the corresponding fabric released docker images
if (arch.indexOf('x64') === 0) {
	docker_arch = ':amd64';
} else if (arch.indexOf('s390') === 0) {
	docker_arch = ':s390x';
} else if (arch.indexOf('ppc64') === 0) {
	docker_arch = ':ppc64le';
} else {
	throw new Error('Unknown architecture: ' + arch);
}

// release check, if master is specified then we are using a fabric that has been
// built from source, otherwise we are using specific published versions.

// prepare thirdpartyImageTag (currently using couchdb image in tests)
if (!/master/.test(thirdparty_release)) {
	thirdpartyImageTag = docker_arch + '-' + thirdparty_release;
}
if (!/master/.test(release)) {
	dockerImageTag = docker_arch + '-' + release;
}
// these environment variables would be read at test/fixtures/docker-compose.yaml
process.env.DOCKER_IMG_TAG = dockerImageTag;
process.env.THIRDPARTY_IMG_TAG = thirdpartyImageTag;

gulp.task('pre-test', () => {
	return gulp.src([
		'fabric-common/lib/**/*.js',
		'fabric-network/lib/**/*.js',
		'fabric-client/lib/**/*.js',
		'fabric-ca-client/lib/FabricCAClientImpl.js',
		'fabric-ca-client/lib/helper.js',
		'fabric-ca-client/lib/IdentityService.js',
		'fabric-ca-client/lib/AffiliationService.js'
	]);
});

gulp.task('clean-up', () => {
	// some tests create temporary files or directories
	// they are all created in the same temp folder
	fs.removeSync(tapeUtil.getTempDir());
	fs.removeSync('fabric-network/lib');
	return fs.ensureFileSync(debugPath);
});

gulp.task('docker-clean', shell.task([
	// stop and remove docker containers
	'docker kill $(docker ps -aq)',
	'docker rm $(docker ps -aq) -f',

	// remove chaincode images so that they get rebuilt during test
	'docker rmi $(docker images | grep "^dev-" | awk \'{print $3}\')'
], {
	verbose: true, // so we can see the docker command output
	ignoreErrors: true // kill, rm, and rmi may fail because the containers may have been cleaned up or not exist
}));

gulp.task('docker-ready', ['docker-clean'], shell.task([
	// make sure that necessary containers are up by docker-compose
	'docker-compose -f test/fixtures/docker-compose/docker-compose-tls-level-db.yaml -p node up -d && sleep 15',
	'docker ps -a'
]));

gulp.task('lint', ['eslint', 'tslint']);

gulp.task('compile', shell.task([
	'npm run compile'
], {
	verbose: true, // so we can see the docker command output
	ignoreErrors: false // once compile failed, throw error
}));

// Execute specific tests  with code coverage enabled
//  - Use nyc instead of gulp-istanbul to generate coverage report
//  - Cannot use gulp-istabul because it throws "unexpected identifier" for async/await functions

// Main test to run all tests
gulp.task('test', shell.task('npx nyc gulp run-test-all'));

// Test to run all unit tests
gulp.task('test-headless', shell.task('npx gulp run-test-headless'));

// Only run Mocha unit tests
gulp.task('test-mocha', shell.task('npx nyc --check-coverage --lines 92 --functions 90 --branches 70 gulp run-test-mocha'));

// Only run javascript scenario tests
gulp.task('test:cucumber', shell.task('npx nyc npm run test:cucumber'));
// Only run typescript scenario tests
gulp.task('test:ts-cucumber', shell.task('npx nyc npm run test:ts-cucumber'));

// Definition of Mocha (unit) test suites
gulp.task('run-test-mocha', (done) => {
	const tasks = ['mocha-fabric-common', 'mocha-fabric-ca-client', 'mocha-fabric-client', 'mocha-fabric-network', 'mocha-fabric-protos'];
	runSequence(...tasks, done);
});
gulp.task('mocha-fabric-common',
	() => {
		return gulp.src(['./fabric-common/test/**/*.js'], {read: false})
			.pipe(mocha({reporter: 'list', exit: true}));
	}
);

gulp.task('mocha-fabric-ca-client',
	() => {
		return gulp.src(['./fabric-ca-client/test/**/*.js'], {read: false})
			.pipe(mocha({reporter: 'list', exit: true}));
	}
);

gulp.task('mocha-fabric-client',
	() => {
		return gulp.src(['./fabric-client/test/**/*.js', '!./fabric-client/test/data/**/*.js'], {read: false})
			.pipe(mocha({reporter: 'list', exit: true, timeout: 10000}));
	}
);

gulp.task('mocha-fabric-network',
	() => {
		return gulp.src(['./fabric-network/test/**/*.{js,ts}'], {read: false})
			.pipe(mocha({reporter: 'list', exit: true, timeout: 10000, require: ['ts-node/register']}));
	}
);

gulp.task('mocha-fabric-protos',
	() => {
		return gulp.src(['./fabric-protos/test/**/*.js'], {read: false})
			.pipe(mocha({reporter: 'list', exit: true}));
	}
);

// Definition of Javascript Cucumber (scenario) test suite
gulp.task('run-test-cucumber', shell.task(
	'export HFC_LOGGING=\'' + cucumber_log + '\'; npm run test:cucumber'
));
// Definition of Typescript Cucumber (scenario) test suite
gulp.task('run-test:ts-cucumber', shell.task(
	'export HFC_LOGGING=\'' + cucumber_log + '\'; npm run test:ts-cucumber'
));

// Run e2e and scenario tests with code coverage
gulp.task('test-fv-scenario', shell.task('npx nyc --check-coverage --lines 92 --functions 90 --branches 70 gulp run-test-fv-scenario'));

// run fv only
gulp.task('test-fv-only', shell.task('npx nyc --check-coverage --lines 92 --functions 90 --branches 70 gulp run-tape-e2e'));

gulp.task('run-test-fv-scenario', (done) => {
	const tasks = ['run-tape-e2e', 'docker-clean', 'run-test:cucumber', 'docker-clean', 'run-test:ts-cucumber'];
	runSequence(...tasks, done);
});

gulp.task('run-test-scenario', (done) => {
	const tasks = ['compile', 'run-test:cucumber', 'docker-clean', 'run-test:ts-cucumber'];
	runSequence(...tasks, done);
});

gulp.task('run-test-merge', (done) => {
	const tasks = ['clean-up', 'docker-clean', 'pre-test',  'compile', 'run-test:cucumber', 'docker-clean', 'run-test:ts-cucumber'];
	runSequence(...tasks, done);
});

gulp.task('run-test-functional', (done) => {
	const tasks = ['compile', 'test-fv-only'];
	runSequence(...tasks, done);
});

// Main test method to run all test suites
// - lint, unit first, then FV, then scenario
gulp.task('run-test-all', (done) => {
	const tasks = ['clean-up', 'docker-clean', 'pre-test', 'compile', 'lint', 'docs', 'test-mocha', 'test-fv-only', 'run-test-scenario'];
	runSequence(...tasks, done);
});
// As above, without scenario
gulp.task('run-test', (done) => {
	const tasks = ['clean-up', 'docker-clean', 'pre-test', 'compile', 'lint', 'docs', 'test-mocha', 'test-fv-only'];
	runSequence(...tasks, done);
});

// fabric end-to-end test
gulp.task('run-end-to-end', (done) => {
	const tasks = ['clean-up', 'docker-clean', 'pre-test', 'compile', 'run-tape-e2e'];
	runSequence(...tasks, done);
});

// Run all non-integration tests
gulp.task('run-test-headless', (done) => {
	const tasks = ['clean-up', 'pre-test', 'compile', 'lint', 'test-mocha'];
	runSequence(...tasks, done);
});

// Run tape e2e test suite
gulp.task('run-tape-e2e', ['docker-ready'],
	() => {
		// this is needed to avoid a problem in tape-promise with adding
		// too many listeners to the "unhandledRejection" event
		process.setMaxListeners(0);

		// use individual tests to control the sequence they get executed
		// first run the ca-tests that tests all the member registration
		// and enrollment scenarios (good and bad calls). Then the rest
		// of the tests will re-use the same key value store that has
		// saved the user certificates so they can interact with the
		// network
		return gulp.src(shouldRunTests([
			'test/integration/fabric-ca-affiliation-service-tests.js',
			'test/integration/fabric-ca-identity-service-tests.js',
			'test/integration/fabric-ca-certificate-service-tests.js',
			'test/integration/fabric-ca-services-tests.js',
			'test/integration/nodechaincode/e2e.js',
			'test/integration/e2e.js',
			'test/integration/network-e2e/e2e.js',
			'test/integration/network-e2e/e2e-hsm.js',
			'test/integration/signTransactionOffline.js',
			'test/integration/query.js',
			'test/integration/client.js',
			'test/integration/orderer-channel-tests.js',
			'test/integration/cloudant-fabricca-tests.js',
			'test/integration/couchdb-fabricca-tests.js',
			'test/integration/fileKeyValueStore-fabricca-tests.js',
			'test/integration/install.js',
			'test/integration/events.js',
			'test/integration/channel-event-hub.js',
			'test/integration/upgrade.js',
			'test/integration/get-config.js',
			'test/integration/create-configtx-channel.js',
			'test/integration/e2e/join-channel.js',
			'test/integration/instantiate.js',
			'test/integration/e2e/invoke-transaction.js',
			'test/integration/e2e/query.js',
			'test/integration/invoke.js',
			'test/integration/network-config.js',
			'test/integration/only-admin.js',
			'test/integration/javachaincode/e2e.js',
			'test/integration/discovery.js',
			'test/integration/grpc.js',

			// Typescript
			'test/typescript/test.js'
		]))
			.pipe(tape({
				reporter: tapColorize()
			}));
	});

// Filter out tests that should not be run on specific operating systems since only the x64 CI jobs are configured with SoftHSM
// - disable the pkcs11 (HSM) tests for s390 (non x86)
// - may be enabled manually with an environment variable, (actually left enabled, but disable the non HSM version of the e2e test)
// - disable javachaincode except for x86 environment
// - may enable the java testing with environment variable
function shouldRunTests(tests) {
	if (arch.startsWith('s390')) {
		// for now always disable the pkcs11 testing on s390
		tests.push('!test/unit/pkcs11.js');
		tests.push('!test/integration/network-e2e/e2e-hsm.js');
	} else if (typeof process.env.PKCS11_TESTS === 'string' && process.env.PKCS11_TESTS.toLowerCase() === 'false') {
		// Disable HSM tests if not doing PKCS11 testing
		tests.push('!test/unit/pkcs11.js');
		tests.push('!test/integration/network-e2e/e2e-hsm.js');
	} else {
		// default is to run the PKCS11 tests so we need to disable the non HSM version
		tests.push('!test/integration/network-e2e/e2e.js');
	}
	// keep the java tests
	if (typeof process.env.JAVA_TESTS === 'string' && process.env.JAVA_TESTS.toLowerCase() === 'true') {
		// disable when z390 or when JAVA tests is off
	} else if ((arch.indexOf('s390') === 0) || (typeof process.env.JAVA_TESTS === 'string' && process.env.JAVA_TESTS.toLowerCase() === 'false')) {
		tests.push('!test/integration/javachaincode/e2e.js');
	}

	return tests;
}
