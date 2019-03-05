/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const os = require('os');
const path = require('path');
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');

const rewire = require('rewire');
const FileSystemCheckpointer = rewire('fabric-network/lib/impl/event/filesystemcheckpointer');

class MockMmap {

}

describe('FileSystemCheckpointer', () => {
	const revert = [];
	let sandbox;
	let pathStub;
	let osStub;
	let checkpointer;
	let mmapStub;
	let channelName;
	let listenerName;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		pathStub = sandbox.stub(path);
		osStub = sandbox.stub(os);

		revert.push(FileSystemCheckpointer.__set__('path', pathStub));
		revert.push(FileSystemCheckpointer.__set__('os', osStub));
		pathStub.join.returns('apath');
		osStub.homedir.returns('homedir');
		path.resolve = (a) => a;
		mmapStub = {
			Create: MockMmap
		};
		FileSystemCheckpointer.__set__('mmap', mmapStub);
		channelName = 'mychannel';
		listenerName = 'mylistener';
		checkpointer = new FileSystemCheckpointer(channelName, listenerName);
	});

	afterEach(() => {
		if (revert.length) {
			revert.forEach(Function.prototype.call, Function.prototype.call);
		}
		sandbox.restore();
	});

	describe('#constructor', () => {
		it('should set basePath without options', () => {
			const check = new FileSystemCheckpointer(channelName, listenerName);
			sinon.assert.called(osStub.homedir);
			sinon.assert.calledWith(pathStub.join, 'homedir', '/.hlf-checkpoint');
			expect(check._basePath).to.equal('apath');
			expect(check.mmapObject).to.null;
			expect(check._channelName).to.equal(channelName);
			expect(check._listenerName).to.equal(listenerName);
		});

		it('should set basePath with options', () => {
			const check = new FileSystemCheckpointer(channelName, listenerName, {basePath: 'somepath'});
			sinon.assert.called(osStub.homedir);
			sinon.assert.calledWith(pathStub.join, 'homedir', '/.hlf-checkpoint');
			expect(check._basePath).to.equal('somepath');
			expect(check.mmapObject).to.null;
		});
	});

	describe('#_initialize', () => {
		let fsStub;
		beforeEach(() => {
			fsStub = sandbox.stub({ensureDirSync() {}});
			FileSystemCheckpointer.__set__('fs', fsStub);
		});

		it('should initialize the mmap object and add it to the Map', () => {
			checkpointer._initialize();
			sinon.assert.calledWith(fsStub.ensureDirSync, 'apath');
			sinon.assert.calledWith(path.join, 'apath', channelName);
			expect(checkpointer.mmapObject).to.be.instanceof(MockMmap);
		});
	});

	describe('#save', () => {

		it('should initialize the checkpointer if memory map doesnt exist', () => {
			checkpointer.save('transaction1', 0);
			expect(checkpointer.mmapObject).to.be.instanceof(MockMmap);
		});

		it('should update an existing mmap object', () => {
			checkpointer.mmapObject = {blockNumber: 0, transactionIds: JSON.stringify(['transactionId'])};
			checkpointer.save('transactionId1', 0);
			expect(checkpointer.mmapObject).to.deep.equal({blockNumber: 0, transactionIds: JSON.stringify(['transactionId', 'transactionId1'])});
		});

		it('should not update an existing mmap object', () => {
			checkpointer.mmapObject = {blockNumber: 0, transactionIds: JSON.stringify(['transactionId'])};
			checkpointer.save(null, 0);
			expect(checkpointer.mmapObject).to.deep.equal({blockNumber: 0, transactionIds: JSON.stringify(['transactionId'])});
		});

		it('should update an existing mmap object when blockNumber changes', () => {
			checkpointer.mmapObject = {blockNumber: 0, transactionIds: JSON.stringify(['transactionId'])};
			checkpointer.save('transactionId', 1);
			expect(checkpointer.mmapObject).to.deep.equal({blockNumber: 1, transactionIds: JSON.stringify(['transactionId'])});
		});

		it('should not add a list of transactions to a map object', () => {
			checkpointer.mmapObject = {blockNumber: 0, transactionIds: JSON.stringify(['transactionId'])};
			checkpointer.save(null, 1);
			expect(checkpointer.mmapObject).to.deep.equal({blockNumber: 1, transactionIds: JSON.stringify([])});
		});
	});

	describe('#load', () => {
		it('should initialize the checkpointer if memory map doesnt exist', () => {
			checkpointer.load();
			expect(checkpointer.mmapObject).to.be.instanceof(MockMmap);
		});

		it('should return the checkpoint', () => {
			const checkpoint = {blockNumber: 0, transactionIds: JSON.stringify([])};
			checkpointer.mmapObject = checkpoint;
			const loadedCheckpoint = checkpointer.load();
			expect(loadedCheckpoint).to.not.equal(checkpoint);
			expect(loadedCheckpoint.blockNumber).to.equal(0);
			expect(loadedCheckpoint.transactionIds).to.deep.equal([]);
		});

		it('should return an empty object if an error is thrown', () => {
			const checkpoint = null;
			checkpointer.mmapObject = checkpoint;
			const loadedCheckpoint = checkpointer.load();
			expect(loadedCheckpoint).to.deep.equal({});
		});
	});
});
