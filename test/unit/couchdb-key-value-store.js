/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const tape = require('tape');
const _test = require('tape-promise').default;
const test = _test(tape);
const CouchdbMock = require('mock-couch');

const CDBKVS = require('fabric-client/lib/impl/CouchDBKeyValueStore.js');

test('\n\n** CouchDBKeyValueStore tests', async (t) => {
	t.throws(
		() => {
			new CDBKVS();
		},
		/Must provide the CouchDB database url to store membership data/,
		'Error checking in the constructor: missing opts'
	);

	t.throws(
		() => {
			new CDBKVS({dummy: 'value'});
		},
		/Must provide the CouchDB database url to store membership data/,
		'Error checking in the constructor: opts object missing required "url"'
	);

	let cdbkvs = new CDBKVS({url: 'http://localhost:9999'});
	try {
		await cdbkvs.init();
		t.fail('Should not have been able to successfully construct a store from an invalid URL');
	} catch (err) {
		if (err.message && err.message.includes('ECONNREFUSED')) {
			t.pass('Successfully rejected the construction request due to invalid URL');
		} else {
			t.fail('Store construction failed for unknown reason: ' + err.stack ? err.stack : err);
		}
	}

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

	try {
		cdbkvs = new CDBKVS({url: 'http://localhost:5985'});
		await cdbkvs.init();
		t.pass('Successfully connected the key value store to couchdb at localhost:5985');

		t.notEqual(cdbkvs._database, undefined, 'Check "_database" value of the constructed store object');

		let value = await cdbkvs.setValue('someKey', 'someValue');
		t.equal(value, 'someValue', 'Check result of setValue()');
		value = await cdbkvs.getValue('someKey');
		t.equal(value, 'someValue', 'Check result of getValue()');
	} catch (err) {
		t.fail(err.stack ? err.stack : err);
	}

	t.end();
});
