/*
Copyright IBM Corp. All Rights Reserved.

SPDX-License-Identifier: Apache-2.0
*/
/* eslint-disable no-console */
'use strict';

const tape = require('tape');
const _test = require('tape-promise').default;
const test = _test(tape);
const testutil = require('./util.js');
const path = require('path');
const fs = require('fs-extra');
const targz = require('targz');

const Packager = require('fabric-client/lib/Packager.js');
const Node = require('fabric-client/lib/packager/Node.js');
const Golang = require('fabric-client/lib/packager/Golang.js');

test('\n\n** BasePackager tests **\n\n', async (t) => {
	const keep = [
		'.keep',
		'.keep2'
	];
	// test with concrete implementations
	const node = new Node(keep);
	t.equal(node.isSource('path/src.keep'), true, 'Node.isSource() should return true for valid extension ".keep"');
	t.equal(node.isSource('path/src.keep2'), true, 'Node.isSource() should return true for valid extension ".keep2"');
	t.equal(node.isSource('path/src.keep3'), false, 'Node.isSource() should return false for invalid extension ".keep3"');
	t.equal(node.isMetadata('path/metadata.json'), true, 'Node.isMetadata() should return true for valid extension ".json"');
	t.equal(node.isMetadata('path/metadata.notjson'), false, 'Node.isMetadata() should return false for invalid extension ".notjson"');
	try {
		const descriptors = await node.findMetadataDescriptors(testutil.METADATA_PATH);
		t.equal(descriptors.length, 1, 'Expected Node.findMetadataDescriptors() to return one valid descriptor');
		const expected = 'META-INF/statedb/couchdb/indexes/index.json';
		t.equal(descriptors[0].name, expected, 'Node.findMetadataDescriptors() should return valid descriptor name');
	} catch (err) {
		t.fail('Node.findMetadataDescriptors() failed with unexpected error');
		t.comment(err.stack ? err.stack : err);
	}

	const golang = new Golang(keep);
	t.equal(golang.isSource('path/src.keep'), true, 'Golang.isSource() should return true for valid extension ".keep"');
	t.equal(golang.isSource('path/src.keep2'), true, 'Golang.isSource() should return true for valid extension ".keep2"');
	t.equal(golang.isSource('path/src.keep3'), false, 'Golang.isSource() should return false for invalid extension ".keep3"');
	t.equal(golang.isMetadata('path/metadata.json'), true, 'Golang.isMetadata() should return true for valid extension ".json"');
	t.equal(golang.isMetadata('path/metadata.notjson'), false, 'Golang.isMetadata() should return false for invalid extension ".notjson"');

	try {
		const descriptors = await golang.findMetadataDescriptors(testutil.METADATA_PATH);
		t.equal(descriptors.length, 1, 'Expected Golang.findMetadataDescriptors() to return one valid descriptor');
		const expected = 'META-INF/statedb/couchdb/indexes/index.json';
		t.equal(descriptors[0].name, expected, 'Node.findMetadataDescriptors() should return valid descriptor name');
	} catch (err) {
		t.fail('Golang.findMetadataDescriptors() failed with unexpected error');
		t.comment(err.stack ? err.stack : err);
	}

	try {
		await golang.findMetadataDescriptors('/somepath');
		t.fail('Should have thrown an exception');
	} catch (err) {
		t.pass('Golang.findMetadataDescriptors() pass with expected error');
		t.comment(err.stack ? err.stack : err);
	}

	t.end();
});

test('\n\n** Golang Packager tests **\n\n', async (t) => {
	const tmpFile = path.join(testutil.getTempDir(), 'test-golang-chaincode.tar.gz');
	const targzDir = path.join(testutil.getTempDir(), 'test-golang-chaincode-tar-gz');

	try {
		const data =  await Packager.package('blah', '', true);
		t.equal(data, null, 'Channel.packageChaincode() should return null for dev mode');
		await Packager.package(null, '', false);
		t.fail('Packager.package() should have rejected a call that does not have chaincodePath parameter');
	} catch (err) {
		const msg = 'Missing chaincodePath parameter';
		if (err.message.indexOf(msg) >= 0) {
			t.pass('Should throw error: ' + msg);
		} else {
			t.fail(err.message + ' should be ' + msg);
			t.end();
		}
	}

	testutil.setupChaincodeDeploy();

	try {
		const data = await Packager.package(testutil.CHAINCODE_PATH, '', true);
		t.equal(data, null, 'Should return null when packaging for dev mode');
		await Packager.package('blah', '', false);
		t.fail('Packager.package() should have rejected a call that does not have valid chaincodePath parameter');
	} catch (err) {
		const msg = 'ENOENT: no such file or directory';
		if (err.message.indexOf(msg) >= 0) {
			t.pass('Should throw error: ' + msg);
		} else {
			t.fail(err.message + 'should be' + msg);
			t.end();
		}
	}

	try {
		const data = await Packager.package(testutil.CHAINCODE_PATH, '', false);
		await check(data, tmpFile, targzDir, () => {
			const checkPath = path.join(targzDir, 'src', 'github.com', 'example_cc', 'example_cc.go');
			console.log('***** tmpFile   :: ' + tmpFile);
			console.log('***** checkPath :: ' + checkPath);
			t.equal(fs.existsSync(checkPath), true, 'The tar.gz file produced by Packager.package() has the "chaincode/github.com/example_cc/example_cc.go" file');
		});
	} catch (err) {
		t.fail('Caught error in golang Package.package tests');
		t.comment(err.stack ? err.stack : err);
	}

	try {
		const data = await Packager.package(testutil.CHAINCODE_PATH, '', false, testutil.METADATA_PATH);
		await check(data, tmpFile, targzDir, () => {
			const checkPath = path.join(targzDir, 'META-INF', 'statedb', 'couchdb', 'indexes', 'index.json');
			t.equal(fs.existsSync(checkPath), true,
				'The tar.gz file produced by Packager.package() has the "META-INF/statedb/couchdb/indexes/index.json" file');
		});
	} catch (err) {
		t.fail('Caught error in Package.package tests ::' + err);
		t.comment(err.stack ? err.stack : err);
	}

	t.end();
});

test('\n\n** Node.js Packager tests **\n\n', async (t) => {
	const destDir = path.join(testutil.getTempDir(), 'test-node-chaincode');
	const tmpFile = path.join(testutil.getTempDir(), 'test-node-chaincode.tar.gz');
	const targzDir = path.join(testutil.getTempDir(), 'test-node-chaincode-tar-gz');

	try {
		const data = await Packager.package(testutil.NODE_CHAINCODE_PATH, 'node', true);
		t.equal(data, null, 'Should return null when packaging for dev mode');
		await Packager.package('blah', 'node', false);
		t.fail('Packager.package() should have rejected a call that does not have valid chaincodePath parameter');
	} catch (err) {
		const msg = 'ENOENT: no such file or directory';
		if (err.message.indexOf(msg) >= 0) {
			t.pass('Should throw error: ' + msg);
		} else {
			t.fail(err.message + 'should be' + msg);
		}
	}

	fs.removeSync(destDir);
	fs.copySync(testutil.NODE_CHAINCODE_PATH, destDir);
	fs.outputFileSync(path.join(destDir, 'node_modules/dummy/package.json'), 'dummy package.json content');
	fs.outputFileSync(path.join(destDir, 'dummy.js'), 'this is the content of dummy.js');

	try {
		let data = await Packager.package(destDir, 'node', false);
		await check(data, tmpFile, targzDir, () => {
			let checkPath = path.join(targzDir, 'src', 'chaincode.js');
			t.equal(fs.existsSync(checkPath), true, 'The tar.gz file produced by Packager.package() has the "src/chaincode.js" file');
			checkPath = path.join(targzDir, 'src', 'package.json');
			t.equal(fs.existsSync(checkPath), true, 'The tar.gz file produced by Packager.package() has the "src/package.json" file');
			checkPath = path.join(targzDir, 'src', 'dummy.js');
			t.equal(fs.existsSync(checkPath), true, 'dummy.js should exist this time, because we does not ignore it');
			checkPath = path.join(targzDir, 'src', 'node_modules');
			t.equal(fs.existsSync(checkPath), false, 'The tar.gz file produced by Packager.package() does not have the "node_modules" folder');
		});

		// ignore the dummy.js
		fs.outputFileSync(path.join(destDir, '.npmignore'), 'dummy.js');

		data = await Packager.package(destDir, 'node', false);
		await check(data, tmpFile, targzDir, () => {
			let checkPath = path.join(targzDir, 'src', 'chaincode.js');
			t.equal(fs.existsSync(checkPath), true, 'The tar.gz file produced by Packager.package() has the "src/chaincode.js" file');
			checkPath = path.join(targzDir, 'src', 'package.json');
			t.equal(fs.existsSync(checkPath), true, 'The tar.gz file produced by Packager.package() has the "src/package.json" file');
			checkPath = path.join(targzDir, 'src', 'node_modules');
			t.equal(fs.existsSync(checkPath), false, 'The tar.gz file produced by Packager.package() does not have the "node_modules" folder');
		});

		fs.outputFileSync(path.join(destDir, '.npmignore'), '');
		fs.outputFileSync(path.join(destDir, 'some.other.file'), 'dummy content');

		data = await Packager.package(destDir, 'node', false);
		await check(data, tmpFile, targzDir, () => {
			let checkPath = path.join(targzDir, 'src', 'chaincode.js');
			t.equal(fs.existsSync(checkPath), true, 'The tar.gz file produced by Packager.package() has the "src/chaincode.js" file');
			checkPath = path.join(targzDir, 'src', 'package.json');
			t.equal(fs.existsSync(checkPath), true, 'The tar.gz file produced by Packager.package() has the "src/package.json" file');
			checkPath = path.join(targzDir, 'src', 'some.other.file');
			t.equal(fs.existsSync(checkPath), true, 'The tar.gz file produced by Packager.package() has the "src/some.other.file" file');
			checkPath = path.join(targzDir, 'src', 'node_modules');
			t.equal(fs.existsSync(checkPath), false, 'The tar.gz file produced by Packager.package() does not has the "node_modules" folder');
		});

		data = await Packager.package(destDir, 'node', false, testutil.METADATA_PATH);
		await check(data, tmpFile, targzDir, () => {
			const checkPath = path.join(targzDir, 'META-INF', 'statedb', 'couchdb', 'indexes', 'index.json');
			t.equal(fs.existsSync(checkPath), true,
				'The tar.gz file produced by Packager.package() has the "META-INF/statedb/couchdb/indexes/index.json" file');
		});
	} catch (err) {
		t.fail('Caught error in Package.package tests ::' + err);
		t.comment(err.stack ? err.stack : err);
	}

	t.end();
});

test('\n\n** Java chaincode Packager tests **\n\n', async (t) => {
	const destDir = path.join(testutil.getTempDir(), 'test-java-chaincode');
	const tmpFile = path.join(testutil.getTempDir(), 'test-java-chaincode.tar.gz');
	const targzDir = path.join(testutil.getTempDir(), 'test-java-chaincode-tar-gz');

	try {
		const dev_mode_package = await Packager.package(testutil.JAVA_CHAINCODE_PATH, 'java', true);
		t.equal(dev_mode_package, null, 'Should return null when packaging for dev mode');
		try {
			await Packager.package('blah', 'java', false);
			t.fail('Packager.package() should have rejected a call that does not have valid chaincodePath parameter');
		} catch (error) {
			const msg = 'ENOENT: no such file or directory';
			if (error.message.indexOf(msg) >= 0) {
				t.pass('Should throw error: ' + msg);
			} else {
				t.fail(error.message + 'should be' + msg);
				t.end();
			}
		}

		fs.removeSync(destDir);
		fs.copySync(testutil.JAVA_CHAINCODE_PATH, destDir);

		const real_package = await Packager.package(destDir, 'java', false);
		await processPackage(real_package, tmpFile, targzDir);
		let checkPath = path.join(targzDir, 'src', 'src', 'main', 'java', 'org', 'hyperledger', 'fabric', 'example', 'SimpleChaincode.java');
		t.equal(fs.existsSync(checkPath), true, 'The tar.gz file produced by Packager.package() has the "SimpleChaincode.java" file');

		const meta_package = await Packager.package(destDir, 'java', false, testutil.METADATA_PATH);
		await processPackage(meta_package, tmpFile, targzDir);
		checkPath = path.join(targzDir, 'META-INF', 'statedb', 'couchdb', 'indexes', 'index.json');
		t.equal(fs.existsSync(checkPath), true, 'The tar.gz file produced by Packager.package() has the "META-INF/statedb/couchdb/indexes/index.json" file');
	} catch (overall_error) {
		t.fail('Caught error in Java Package.package tests ::' + overall_error);
		t.comment(overall_error.stack ? overall_error.stack : overall_error);
	}

	t.end();
});

function check(data, tmpfile, targzDir, checkFcn) {
	return new Promise((resolve, reject) => {
		fs.writeFileSync(tmpfile, data);
		fs.removeSync(targzDir);
		targz.decompress({
			src: tmpfile,
			dest: targzDir
		}, (err) => {
			if (err) {
				reject('Failed to extract generated chaincode package. ' + err);
			} else {
				checkFcn();
				resolve();
			}
		});
	});
}

function processPackage(data, tempFile, targetDir) {
	return new Promise((resolve, reject) => {
		fs.writeFileSync(tempFile, data);
		fs.removeSync(targetDir);
		targz.decompress({
			src: tempFile,
			dest: targetDir
		}, (err) => {
			if (err) {
				reject('Failed to extract generated chaincode package. ' + err);
			}
			resolve();
		});
	});
}