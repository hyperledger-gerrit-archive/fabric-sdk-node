/**
 * Copyright 2016-2017 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

if (global && global.hfc) {
	global.hfc.config = undefined;
}
require('nconf').reset();

const tape = require('tape');
const _test = require('tape-promise').default;
const test = _test(tape);

const util = require('util');
const testutil = require('./util.js');
const {Utils: utils} = require('fabric-common');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const jsrsa = require('jsrsasign');
const KEYUTIL = jsrsa.KEYUTIL;
const CouchdbMock = require('mock-couch');
const nano = require('nano');

const ecdsaKey = require('fabric-common/lib/impl/ecdsa/key.js');
const CKS = require('fabric-common/lib/impl/CryptoKeyStore.js');
const CouchDBKeyValueStore = require('fabric-common/lib/impl/CouchDBKeyValueStore.js');

const TEST_KEY_PRIVATE_PEM = '-----BEGIN PRIVATE KEY-----' +
'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgZYMvf3w5VkzzsTQY' +
'I8Z8IXuGFZmmfjIX2YSScqCvAkihRANCAAS6BhFgW/q0PzrkwT5RlWTt41VgXLgu' +
'Pv6QKvGsW7SqK6TkcCfxsWoSjy6/r1SzzTMni3J8iQRoJ3roPmoxPLK4' +
'-----END PRIVATE KEY-----';
const TEST_KEY_PRIVATE_CERT_PEM = '-----BEGIN CERTIFICATE-----' +
'MIICEDCCAbagAwIBAgIUXoY6X7jIpHAAgL267xHEpVr6NSgwCgYIKoZIzj0EAwIw' +
'fzELMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNh' +
'biBGcmFuY2lzY28xHzAdBgNVBAoTFkludGVybmV0IFdpZGdldHMsIEluYy4xDDAK' +
'BgNVBAsTA1dXVzEUMBIGA1UEAxMLZXhhbXBsZS5jb20wHhcNMTcwMTAzMDEyNDAw' +
'WhcNMTgwMTAzMDEyNDAwWjAQMQ4wDAYDVQQDEwVhZG1pbjBZMBMGByqGSM49AgEG' +
'CCqGSM49AwEHA0IABLoGEWBb+rQ/OuTBPlGVZO3jVWBcuC4+/pAq8axbtKorpORw' +
'J/GxahKPLr+vVLPNMyeLcnyJBGgneug+ajE8srijfzB9MA4GA1UdDwEB/wQEAwIF' +
'oDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDAYDVR0TAQH/BAIwADAd' +
'BgNVHQ4EFgQU9BUt7QfgDXx9g6zpzCyJGxXsNM0wHwYDVR0jBBgwFoAUF2dCPaqe' +
'gj/ExR2fW8OZ0bWcSBAwCgYIKoZIzj0EAwIDSAAwRQIgcWQbMzluyZsmvQCvGzPg' +
'f5B7ECxK0kdmXPXIEBiizYACIQD2x39Q4oVwO5uL6m3AVNI98C2LZWa0g2iea8wk' +
'BAHpeA==' +
'-----END CERTIFICATE-----';

const dbname = 'test_keystore';
const dbclient = nano('http://localhost:5985');

const f1 = KEYUTIL.getKey(TEST_KEY_PRIVATE_PEM);
const testPrivKey = new ecdsaKey(f1);
const f2 = KEYUTIL.getKey(TEST_KEY_PRIVATE_CERT_PEM);
const testPubKey = new ecdsaKey(f2);

test('\n\n** CryptoKeyStore tests **\n\n', async (t) => {
	testutil.resetDefaults();

	const keystorePath = path.join(testutil.getTempDir(), 'crypto-key-store/');

	const store = new CKS({path: keystorePath});
	try {
		await store.initialize();
		await store.putKey(testPrivKey);
		t.pass('Successfully saved private key in store');
		t.equal(fs.existsSync(path.join(keystorePath, testPrivKey.getSKI() + '-priv')), true,
			'Check that the private key has been saved with the proper <SKI>-priv index');
	} catch (err) {
		t.fail(err.stack ? err.stack : err);
		t.end();
	}
	try {
		const recoveredKey = await store.getKey(testPrivKey.getSKI());
		t.notEqual(recoveredKey, null, 'Successfully read private key from store using SKI');
		t.equal(recoveredKey.isPrivate(), true, 'Test if the recovered key is a private key');
	} catch (err) {
		t.fail(err.stack ? err.stack : err);
		t.end();
	}
	try {
		await store.putKey(testPubKey);
		t.equal(fs.existsSync(path.join(keystorePath, testPrivKey.getSKI() + '-pub')), true,
			'Check that the public key has been saved with the proper <SKI>-pub index');
	} catch (err) {
		t.fail(err.stack ? err.stack : err);
		t.end();
	}
	try {
		const recoveredKey = await store.getKey(testPubKey.getSKI());
		t.notEqual(recoveredKey, null, 'Successfully read public key from store using SKI');
		t.equal(recoveredKey.isPrivate(), true, 'Test if the recovered key is a private key');
		// delete the private key entry and test if getKey() would return the public key
		fs.unlinkSync(path.join(keystorePath, testPrivKey.getSKI() + '-priv'));
	} catch (err) {
		t.fail(err.stack ? err.stack : err);
		t.end();
	}
	try {
		const recoveredKey = await store.getKey(testPubKey.getSKI());
		t.notEqual(recoveredKey, null, 'Successfully read public key from store using SKI');
		t.equal(recoveredKey.isPrivate(), false, 'Test if the recovered key is a public key');
		t.end();
	} catch (err) {
		t.fail(err.stack ? err.stack : err);
		t.end();
	}
});

test('\n\n** CryptoKeyStore tests - couchdb based store tests - use configSetting **\n\n', async (t) => {
	utils.setConfigSetting('key-value-store', 'fabric-common/lib/impl/CouchDBKeyValueStore.js');

	const couchdb = CouchdbMock.createServer();
	couchdb.listen(5985);

	// override t.end function so it'll always disconnect the event hub
	t.end = ((context, mockdb, f) => {
		return function () {
			if (mockdb) {
				t.comment('Disconnecting the mock couchdb server');
				mockdb.close();
			}

			f.apply(context, arguments);
		};
	})(t, couchdb, t.end);

	const store = new CKS({name: dbname, url: 'http://localhost:5985'});
	try {
		await testKeyStore(store, t);
		t.end();
	} catch (err) {
		t.fail(err.stack ? err.stack : err);
		t.end();
	}
});

test('\n\n** CryptoKeyStore tests - couchdb based store tests - use constructor argument **\n\n', async (t) => {
	const couchdb = CouchdbMock.createServer();
	couchdb.listen(5985);

	// override t.end function so it'll always disconnect the event hub
	t.end = ((context, mockdb, f) => {
		return function () {
			if (mockdb) {
				t.comment('Disconnecting the mock couchdb server');
				mockdb.close();
			}

			f.apply(context, arguments);
		};
	})(t, couchdb, t.end);

	const store = new CKS(CouchDBKeyValueStore, {name: dbname, url: 'http://localhost:5985'});
	try {
		await testKeyStore(store, t);
		t.end();
	} catch (err) {
		t.fail(err.stack ? err.stack : err);
		t.end();
	}
});

async function testKeyStore(store, t) {
	let docRev;

	await store.initialize();
	await store.putKey(testPrivKey);
	t.pass('Successfully saved private key in store based on couchdb');

	let recoveredKey = await new Promise((resolve) => {
		dbclient.use(dbname).get(testPrivKey.getSKI() + '-priv', (err, body) => {
			if (!err) {
				t.pass('Successfully verified private key persisted in couchdb');
				docRev = body._rev;
				return resolve(store.getKey(testPrivKey.getSKI()));
			} else {
				t.fail('Failed to persist private key in couchdb. ' + err.stack ? err.stack : err);
				t.end();
			}
		});
	});
	t.notEqual(recoveredKey, null, 'Successfully read private key from store using SKI');
	t.equal(recoveredKey.isPrivate(), true, 'Test if the recovered key is a private key');
	await store.putKey(testPubKey);
	recoveredKey = await new Promise((resolve) => {
		dbclient.use(dbname).get(testPrivKey.getSKI() + '-pub', (err) => {
			if (!err) {
				t.pass('Successfully verified public key persisted in couchdb');
				return resolve(store.getKey(testPubKey.getSKI()));
			} else {
				t.fail('Failed to persist public key in couchdb. ' + err.stack ? err.stack : err);
				t.end();
			}
		});
	});
	t.notEqual(recoveredKey, null, 'Successfully read public key from store using SKI');
	t.equal(recoveredKey.isPrivate(), true, 'Test if the recovered key is a private key');
	// delete the private key entry and test if getKey() would return the public key
	recoveredKey = await new Promise((resolve) => {
		dbclient.use(dbname).destroy(testPrivKey.getSKI() + '-priv', docRev, (err) => {
			if (!err) {
				return resolve(store.getKey(testPubKey.getSKI()));
			} else {
				t.fail('Failed to delete private key in couchdb. ' + err.stack ? err.stack : err);
				t.end();
			}
		});
	});
	t.notEqual(recoveredKey, null, 'Successfully read public key from store using SKI');
	t.equal(recoveredKey.isPrivate(), false, 'Test if the recovered key is a public key');
}

test('\n\n** CryptoKeyStore tests - newCryptoKeyStore tests **\n\n', (t) => {
	utils.setConfigSetting('key-value-store', 'fabric-common/lib/impl/FileKeyValueStore.js');// force for 'gulp test'
	const keyValStorePath = 'tmp/keyValStore1';
	const config = {path: keyValStorePath};
	let cs = utils.newCryptoKeyStore(config);
	t.equal(cs._opts, config, util.format('Returned instance should have store config opts of %j', config));
	t.equal(typeof cs._superClass, 'function', 'Returned instance should have store config superClass');

	const defaultKVSPath = path.join(os.homedir(), '.hfc-key-store');
	cs = utils.newCryptoKeyStore();
	t.equal(cs._opts.path, defaultKVSPath, util.format('Returned instance should have store config opts.path of %s', defaultKVSPath));
	t.equal(typeof cs._superClass, 'function', 'Returned instance should have store config superClass');

	let kvsImplClass = require(utils.getConfigSetting('key-value-store'));
	cs = utils.newCryptoKeyStore(kvsImplClass);
	t.equal(cs._opts.path, defaultKVSPath, util.format('Returned instance should have store config opts.path of %s', defaultKVSPath));
	t.equal(typeof cs._superClass, 'function', 'Returned instance should have store config superClass');

	kvsImplClass = require(utils.getConfigSetting('key-value-store'));
	cs = utils.newCryptoKeyStore(kvsImplClass, config);
	t.equal(cs._opts, config, util.format('Returned instance should have store config opts of %j', config));
	t.equal(typeof cs._superClass, 'function', 'Returned instance should have store config superClass');

	t.end();
});

test('\n\n** CryptoKeyStore tests - getKey error tests **\n\n', (t) => {
	// override t.end function so it'll always clear the config settings
	testutil.resetDefaults();
	const cryptoSuite = utils.newCryptoSuite();
	cryptoSuite.getKey('blah').catch(err => {
		t.ok(err.toString().includes('getKey requires CryptoKeyStore to be set.'),
			'Test missing cryptoKeyStore: cryptoSuite.getKey');
		t.end();
	});

});
