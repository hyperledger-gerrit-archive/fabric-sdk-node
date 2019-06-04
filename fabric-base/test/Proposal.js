/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const rewire = require('rewire');

const Proposal_Rewired = rewire('../lib/Proposal');

const Channel = require('../lib/Channel');
const Chaincode = require('../lib/Chaincode');
const Proposal = require('../lib/Proposal');
const TransactionContext = require('../lib/TransactionContext');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const should = chai.should();
const expect = chai.expect;
chai.use(chaiAsPromised);

function propertiesToBeInstanceOf(obj, properties, clazz) {
	properties.forEach((prop) => {
		if (obj.hasOwnProperty(prop)) {
			obj[prop].should.be.instanceof(clazz);
		} else {
			should.fail();
		}
	});
}

describe('Proposal', () => {
	let sandbox;
	let revert;
	let FakeLogger;

	let chaincode;
	let channel;
	let proposal;
	let identity;

	beforeEach(() => {
		revert = [];
		sandbox = sinon.createSandbox();

		FakeLogger = {
			debug: () => { },
			error: () => { }
		};
		sandbox.stub(FakeLogger);
		revert.push(Proposal_Rewired.__set__('logger', FakeLogger));

		chaincode = new Chaincode('mychaincode', 'v1');
		channel = new Channel('mychannel');
		proposal = new Proposal_Rewired(chaincode, channel);
		identity = 'identity';
	});

	afterEach(() => {
		if (revert.length) {
			revert.forEach(Function.prototype.call, Function.prototype.call);
		}
		sandbox.restore();
	});

	describe('#constructor', () => {
		it('should require a chaincode', () => {
			(() => {
				new Proposal();
			}).should.throw('Missing chaincode parameter');
		});

		it('should require a channel', () => {
			(() => {
				new Proposal({});
			}).should.throw('Missing channel parameter');
		});

		it('should create an instance and define the correct properties', () => {
			const chaincode = new Chaincode('mychaincode', 'v1');
			const channel = new Channel('mychannel');
			const proposal_real = new Proposal(chaincode, channel);
			propertiesToBeInstanceOf(proposal_real, ['chaincode'], Chaincode);
			propertiesToBeInstanceOf(proposal_real, ['channel'], Channel);
		});
	});

	describe('#toString', () => {
		it('should get the object contents in string form', () => {
			const value = proposal.toString();
			should.equal(value, 'Proposal: {chaincode: mychaincode, channel: mychannel, fcn: invoke}');
		});
	});

	describe('#setFunctionName', () => {
		it('should be able to set a function name', () => {
			proposal.setFunctionName('function');
			should.equal(proposal.fcn, 'function');
		});
	});

	describe('#setFunctionArguments', () => {
		it('should be able to set a function arguments', () => {
			proposal.setFunctionArguments(['arg1', 'arg2']);
			expect(proposal.args).to.deep.equal(['arg1', 'arg2']);

		});
	});

	describe('#setTransactionContext', () => {
		it('should be able to set a txContext', () => {
			const txContext = new TransactionContext(identity);
			proposal.setTransactionContext(txContext);
			expect(proposal.txContext).to.deep.equal(txContext);

		});
	});

	describe('#setTransientMap', () => {
		it('should be able to set a transient map', () => {
			const transientMap = new Map();
			transientMap.set('key1', 'value1');
			transientMap.set('key2', 'value2');
			proposal.setTransientMap(transientMap);
			expect(proposal.transientMap).to.deep.equal(transientMap);
		});
	});
});
