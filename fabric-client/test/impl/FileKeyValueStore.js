/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const rewire = require('rewire');
const FileKeyValueStoreRW = rewire('../../lib/impl/FileKeyValueStore');

const chai = require('chai');
const should = chai.should();
const sinon = require('sinon');

describe('FileKeyValueStore', () => {

	let revert;
	let mkDirStub;
	let readFileStub;
	let writeFileStub;
	let fsStub;
	let errorStub;
	let debugStub;
	let fakeLogger;


	beforeEach(() => {
		revert = [];
		mkDirStub = sinon.stub().returns();
		readFileStub = sinon.stub().resolves();
		writeFileStub = sinon.stub().resolves();
		fsStub = {
			mkdirSync: mkDirStub,
			readFile: readFileStub,
			writeFile: writeFileStub
		};

		errorStub = sinon.stub();
		debugStub = sinon.stub();
		fakeLogger = {
			debug: debugStub,
			error: errorStub
		};

		revert.push(FileKeyValueStoreRW.__set__('fs', fsStub));
		revert.push(FileKeyValueStoreRW.__set__('logger', fakeLogger));
	});

	afterEach(() => {
		if (revert.length) {
			revert.forEach(Function.prototype.call, Function.prototype.call);
		}
	});

	describe('Constructor', () => {

		it('should throw when no options are given', () => {
			(() => {
				new FileKeyValueStoreRW();
			}).should.throw(/Must provide the path to the directory to hold files for the store./);
		});

		it('should throw when no required options are given', () => {
			(() => {
				new FileKeyValueStoreRW({penguin: 'unrequired'});
			}).should.throw(/Must provide the path to the directory to hold files for the store./);
		});

		it('should throw on error when creating dir', () => {
			(() => {
				const err = new Error('fake error');
				err.code = 42;
				mkDirStub.throws(err);
				new FileKeyValueStoreRW({path: '/such_path'});
			}).should.throw(/fake error/);
			sinon.assert.calledOnce(errorStub);
			sinon.assert.calledWith(errorStub, 'constructor, error creating directory, code: %s', 42);
		});

		it('should call fs.mkdirs with passed directory', () => {
			new FileKeyValueStoreRW({path: '/such_path'});

			// Check correct calls
			sinon.assert.calledOnce(mkDirStub);
			sinon.assert.notCalled(readFileStub);
			sinon.assert.notCalled(writeFileStub);

			// check passed args
			mkDirStub.getCall(0).args[0].should.equal('/such_path');

			// debug logging
			sinon.assert.calledOnce(debugStub);
			sinon.assert.calledWith(debugStub, 'constructor', {options: {path: '/such_path'}});

		});

	});

	describe('#getValue()', () => {
		it('should call fs.readFile with passed directory key and utf8 opts', async () => {
			const myKeys  = await new FileKeyValueStoreRW({path: '/such_path'});
			myKeys.getValue('myKey');

			// Check correct calls
			sinon.assert.calledOnce(mkDirStub);
			sinon.assert.calledOnce(readFileStub);
			sinon.assert.notCalled(writeFileStub);

			// check passed args
			readFileStub.getCall(0).args[0].should.equal('/such_path/myKey');
			readFileStub.getCall(0).args[1].should.equal('utf8');

			// debug logging
			sinon.assert.calledWith(debugStub, 'getValue', {key: 'myKey'});
		});

		it('should resolve null if the error returned is ENOENT', async () => {
			const err = new Error('fake error');
			err.code = 'ENOENT';
			readFileStub.rejects(err);

			const myKeys  = await new FileKeyValueStoreRW({path: '/such_path'});
			const resp = await myKeys.getValue('myKey');
			should.not.exist(resp);
		});

		it('should reject if the error returned is not ENOENT', async () => {
			const err = new Error('fake rethrow error');
			err.code = 'NOT ENOENT';
			readFileStub.rejects(err);
			const myKeys  = await new FileKeyValueStoreRW({path: '/such_path'});
			await myKeys.getValue('myKey').should.be.rejectedWith(/fake rethrow error/);
		});
	});

	describe('#setValue()', () => {

		it('should call fs.writeFile with default path and passed value', async () => {
			const myKeys  = await new FileKeyValueStoreRW({path: '/such_path'});
			await myKeys.setValue('myKey', 'myValue');

			// Check correct calls
			sinon.assert.calledOnce(mkDirStub);
			sinon.assert.notCalled(readFileStub);
			sinon.assert.calledOnce(writeFileStub);

			// check passed args
			writeFileStub.getCall(0).args[0].should.equal('/such_path/myKey');
			writeFileStub.getCall(0).args[1].should.equal('myValue');

			// debug logging
			sinon.assert.calledWith(debugStub, 'setValue', {key: 'myKey'});
		});

		it('should reject if the error returned is not ENOENT', async () => {
			const err = new Error('fake rethrow error');
			writeFileStub.rejects(err);
			const myKeys  = await new FileKeyValueStoreRW({path: '/such_path'});
			await myKeys.setValue('myKey').should.be.rejectedWith(/fake rethrow error/);
		});
	});

});
