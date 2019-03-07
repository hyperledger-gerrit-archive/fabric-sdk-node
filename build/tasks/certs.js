/*
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
*/

const gulp = require('gulp');
const shell = require('gulp-shell');
const runSequence = require('run-sequence');

const binariesPath = '/tmp/fabric-binaries';
const tarFileDarwin = 'hyperledger-fabric-darwin-amd64-1.4.0.tar.gz';
const tarFileLinux = 'hyperledger-fabric-linux-amd64-1.4.0.tar.gz';
const tarFile390 = 'hyperledger-fabric-linux-s390x-1.0.4.tar.gz';
const mac = 'darwin-amd64-1.4.0/' + tarFileDarwin;
const amd64 = 'linux-amd64-1.4.0/' + tarFileLinux;
const s390 = 'linux-s390x-1.0.4/' + tarFile390;
const binariesRoot = 'https://nexus.hyperledger.org/content/repositories/releases/org/hyperledger/fabric/hyperledger-fabric/';
const macBinaries =  binariesRoot + mac;
const amd64Binaries = binariesRoot + amd64;
const s390Binaries = binariesRoot + s390;

// Retrieve the cryptogen material binaries, pinned at 1.4
// Download and xxtract binaries from tar file
// Set to path via export
gulp.task('get-crypto-binaries-amd64', shell.task(
	'mkdir -p ' + binariesPath + ';' +
	'wget ' + amd64Binaries + ' -P ' + binariesPath + ';' +
	'tar xvzf ' + binariesPath + '/' + tarFileLinux + ' -C ' + binariesPath + ';')
);

gulp.task('get-crypto-binaries-mac', shell.task(
	'mkdir -p ' + binariesPath + ';' +
	'wget ' + macBinaries + ' -P ' + binariesPath + ';' +
	'tar xvzf ' + binariesPath + '/' + tarFileDarwin + ' -C ' + binariesPath + ';')
);

gulp.task('get-crypto-binaries-s390', shell.task(
	'mkdir -p ' + binariesPath + ';' +
	'wget ' + s390Binaries + ' -P ' + binariesPath + ';' +
	'tar xvzf ' + binariesPath + '/' + tarFile390 + ' -C ' + binariesPath + ';')
);

// Generate required crypto material, channel tx blocks, and fabric ca certs
// - shell command to run the required test file scripts
gulp.task('generate-test-certs', shell.task(
	'./test/fixtures/crypto-material/generateAll.sh ' + binariesPath + '/bin;' +
	'./test/fixtures/fabricca/generateCSR.sh;')
);

// Perform both of the above sequentially
gulp.task('install-and-generate-certs', (done) => {
	const tasks = ['get-crypto-binaries-amd64', 'generate-test-certs'];
	runSequence(...tasks, done);
});

gulp.task('install-and-generate-certs-mac', (done) => {
	const tasks = ['get-crypto-binaries-mac', 'generate-test-certs'];
	runSequence(...tasks, done);
});

gulp.task('install-and-generate-certs-s390', (done) => {
	const tasks = ['get-crypto-binaries-s390', 'generate-test-certs'];
	runSequence(...tasks, done);
});
