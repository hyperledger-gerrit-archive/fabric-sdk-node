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
const sinon = require('sinon');

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

	try {
		await new CDBKVS({url: 'http://localhost:9999'});
		t.fail('Should not have been able to successfully construct a store from an invalid URL');
		throw new Error('Failed');
	} catch (err) {
		if (err.message && err.message.indexOf('ECONNREFUSED') > 0) {
			t.pass('Successfully rejected the construction request due to invalid URL');
		} else {
			t.fail('Store construction failed for unknown reason: ' + err.stack ? err.stack : err);
			throw new Error('Failed');
		}
	}

	try {
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
		const store = await new CDBKVS({url: 'http://localhost:5985'});
		t.pass('Successfully connected the key value store to couchdb at localhost:5985');

		t.notEqual(store._database, undefined, 'Check "_database" value of the constructed store object');

		const get = function (a, b) {
			b(null, {_rev: 101});
		};
		const insert = function (a, b) {
			b(null, 'someValue');
		};
		const fakeDB = {
			get: sinon.stub().callsFake(get),
			insert: sinon.stub().callsFake(insert),
		};
		store._database = fakeDB;

		let value = await store.setValue('someKey', 'someValue');
		t.equal(value, 'someValue', 'Check result of setValue()');

		const fakeReturn = function (a, b) {
			b(null, {
				member: 'someValue'
			});
		};
		const fakeGet = {
			get: sinon.stub().callsFake(fakeReturn)
		};
		store._database = fakeGet;

		value = await store.getValue('someKey');
		t.equal(value, 'someValue', 'Check result of getValue()');
		t.end();
	} catch (err) {
		t.fail(err.stack ? err.stack : err);
		t.end();
	}
});
