/**
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable no-throw-literal */

const rewire = require('rewire');
const EventService = rewire('../lib/EventService');
const Client = rewire('../lib/Client');
const User = require('../lib/User');
const EventListener = require('../lib/EventListener');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const should = chai.should();
const sinon = require('sinon');
const Long = require('long');
const Writable = require('stream').Writable;
const util = require('util');

const TestUtils = require('./TestUtils');

describe('EventService', () => {
	TestUtils.setCryptoConfigSettings();

	let FakeLogger;
	let revert;
	let sandbox;
	const client = new Client('myclient');
	client._tls_mutual.clientCertHash = Buffer.from('clientCertHash');
	let channel;
	let eventService;
	let endpoint;

	const user = User.createUser('user', 'password', 'mspid', TestUtils.certificateAsPEM, TestUtils.keyAsPEM);
	const idx = client.newIdentityContext(user);

	const tmpSetDelete = Set.prototype.delete;
	const block = {
		data: {
			data: [
				{
					payload: {
						data: {
							actions: [
								{
									payload: {
										action: {
											proposal_response_payload: {
												extension: {events: {chaincode_id: 'mychaincode', event_name: 'event', tx_id: 'tx_id', payload: 'payload'}}
											}
										}
									}
								}
							]
						},
						header: {
							channel_header: {type: 3, tx_id: 'tx_id'}
						}
					}
				}
			]
		},
		metadata: {
			metadata: ['SIGNATURES', 'LAST_CONFIG', [0]]
		},
		header: {number: 1}
	};

	beforeEach(() => {
		revert = [];
		sandbox = sinon.createSandbox();

		FakeLogger = {
			debug: () => {
			},
			error: () => {
			},
			warn: () => {
			}
		};
		sandbox.stub(FakeLogger);
		revert.push(EventService.__set__('logger', FakeLogger));

		channel = client.newChannel('mychannel');
		eventService = new EventService('myhub', channel);
		endpoint = client.newEndpoint({url: 'grpc://host:2700'});
	});

	afterEach(() => {
		if (revert.length) {
			revert.forEach(Function.prototype.call, Function.prototype.call);
		}
		sandbox.restore();
		Set.prototype.delete = tmpSetDelete;
	});

	describe('#constructor', () => {
		it('should log on entry', () => {
			new EventService({}, {});
			sinon.assert.calledWith(FakeLogger.debug, 'EventService.constructor[myhub] - start ');
		});
		it('should throw if name arg not given', () => {
			(() => {
				new EventService();
			}).should.throw(/Missing name parameter/);
		});
		it('should throw if channel arg not given', () => {
			(() => {
				new EventService('myhub');
			}).should.throw(/Missing channel parameter/);
		});
		it('should create and have these settings by default', () => {
			const eventService2 = new EventService('myhub', channel);
			eventService2.name.should.equal('myhub');
			eventService2.type.should.equal('EventService');
			eventService2.start_block.should.equal('newest');
			eventService2.end_block_seen.should.be.false;
			eventService2._reg_counter.should.be.equal(0);
			eventService2._haveBlockListeners.should.be.false;
			eventService2._haveTxListeners.should.be.false;
			eventService2._haveChaincodeListeners.should.be.false;
			eventService2._close_running.should.be.false;
			eventService2.channel.should.be.deep.equal(channel);
		});
	});

	describe('#getLastBlockNumber', () => {
		it('should return null if no block seen', () => {
			should.equal(eventService.getLastBlockNumber(), null);
		});

		it('should return a long if it has been seen', () => {
			eventService.lastBlockNumber = Long.fromValue(1);
			should.equal(eventService.getLastBlockNumber().toInt(), 1);
		});
	});

	describe('#close', () => {
		it('should close', () => {
			eventService._close = sinon.stub();
			eventService.close();
			sinon.assert.called(eventService._close);
		});
	});

	describe('#_close', () => {
		it('should throw if reason_error arg not given', () => {
			(() => {
				eventService._close();
			}).should.throw(/Missing reason_error parameter/);
		});
		it('should see close is already running', () => {
			eventService._close_running = true;
			eventService._close(new Error('test'));
			sinon.assert.calledWith(FakeLogger.debug, '_close[myhub] - close is running - exiting');
		});
		it('should close without an eventer endpoint being assigned', () => {
			eventService._closeAllCallbacks = sinon.stub();
			eventService._close(new Error('test'));
			sinon.assert.calledWith(FakeLogger.debug, '_close[myhub] - end');
		});
		it('should close if the eventer assigned', () => {
			eventService._closeAllCallbacks = sinon.stub();
			eventService.eventer = sinon.stub();
			eventService.eventer.disconnect = sinon.stub();
			eventService._close(new Error('test'));
			sinon.assert.calledWith(FakeLogger.debug, '_close[myhub] - end');
		});
	});

	describe('#build', () => {
		it('should require a idContext', () => {
			(() => {
				eventService.build();
			}).should.throw('Missing idContext parameter');
		});
		it('startBlock not greater than endBlock', () => {
			(() => {
				const options = {
					startBlock: 10,
					endBlock: 9
				};
				eventService.build(idx, options);
			}).should.throw('"startBlock" must not be greater than "endBlock"');
		});
		it('startBlock not greater than endBlock, newest is bigger than oldest', () => {
			(() => {
				const options = {
					startBlock: 'newest',
					endBlock: 'oldest'
				};
				eventService.build(idx, options);
			}).should.throw('"startBlock" must not be greater than "endBlock"');
		});
		it('startBlock not greater than endBlock, startBlock defaults to newest', () => {
			(() => {
				const options = {
					endBlock: 'oldest'
				};
				eventService.build(idx, options);
			}).should.throw('"startBlock" must not be greater than "endBlock"');
		});
		it('startBlock is not valid', () => {
			(() => {
				const options = {
					startBlock: 'bad',
					endBlock: 9
				};
				eventService.build(idx, options);
			}).should.throw('value:bad is not a valid number');
		});
		it('endBlock is not valid', () => {
			(() => {
				const options = {
					startBlock: 10,
					endBlock: 'bad'
				};
				eventService.build(idx, options);
			}).should.throw('value:bad is not a valid number');
		});
		it('endBlock is not valid', () => {
			(() => {
				const options = {
					startBlock: 10,
					endBlock: 'bad'
				};
				eventService.build(idx, options);
			}).should.throw('value:bad is not a valid number');
		});
		it('blocktype must be a string', () => {
			(() => {
				const options = {
					blockType: {}
				};
				eventService.build(idx, options);
			}).should.throw('"blockType must be a string');
		});
		it('blocktype must be valid', () => {
			(() => {
				const options = {
					blockType: 'bad'
				};
				eventService.build(idx, options);
			}).should.throw('Invalid blockType bad');
		});
		it('should build with default options', () => {
			eventService.build(idx);
			should.exist(eventService._payload);
		});
		it('should build with startBlock and endBlock as valid numbers', () => {
			const options = {
				startBlock: 9,
				endBlock: 10
			};
			eventService.build(idx, options);
			should.exist(eventService._payload);
		});
		it('should build with startBlock and endBlock as valid numbers', () => {
			const options = {
				startBlock: '9',
				endBlock: '10'
			};
			eventService.build(idx, options);
			should.exist(eventService._payload);
		});
		it('should build with startBlock and endBlock as valid numbers', () => {
			const options = {
				startBlock: Long.fromValue(9),
				endBlock: Long.fromValue(10)
			};
			eventService.build(idx, options);
			should.exist(eventService._payload);
		});
		it('should build with startBlock and endBlock as valid strings', () => {
			const options = {
				startBlock: 'newest',
				endBlock: 'newest'
			};
			eventService.build(idx, options);
			should.exist(eventService._payload);
		});
		it('should build with startBlock and endBlock as valid strings', () => {
			const options = {
				startBlock: 'oldest',
				endBlock: 'oldest'
			};
			eventService.build(idx, options);
			should.exist(eventService._payload);
		});
		it('should build with startBlock and endBlock as valid strings', () => {
			const options = {
				endBlock: 'newest'
			};
			eventService.build(idx, options);
			should.exist(eventService._payload);
		});
		it('should build with startBlock and endBlock as valid strings', () => {
			const options = {
				startBlock: 'oldest'
			};
			eventService.build(idx, options);
			should.exist(eventService._payload);
		});
		it('should build with startBlock and endBlock as valid strings', () => {
			const options = {
				startBlock: 'newest'
			};
			eventService.build(idx, options);
			should.exist(eventService._payload);
		});
	});

	describe('#send', () => {
		it('throws if targets is missing', async () => {
			await eventService.send().should.be.rejectedWith('Missing targets parameter');
		});
		it('runs ok', async () => {
			const eventer1 = client.newEventer('eventer1');
			sinon.stub(eventService, '_startService').resolves(eventer1);
			eventService._payload =  Buffer.from('payload');
			eventService._signature = Buffer.from('signature');
			await eventService.send({targets: [eventer1]});
			eventService.eventer.should.be.deep.equal(eventer1);
		});
		it('rejects if not built and signed', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.checkConnection = sinon.stub().returns(true);
			await eventService.send({targets: [eventer1]}).should.be.rejectedWith('The send payload has not been built');
		});
		it('', async () => {
			const eventer1 = client.newEventer('eventer1');
			sinon.stub(eventService, '_startService').rejects(Error('failed'));
			eventService._payload =  Buffer.from('payload');
			eventService._signature = Buffer.from('signature');
			await eventService.send({targets: [eventer1]}).should.be.rejectedWith('failed');
			sinon.assert.calledWith(FakeLogger.error, '%s - Starting stream to %s failed');
		});
	});

	describe('#_send', () => {
		let eventProtoDeliverStub;
		let deliverFilteredStub;
		let deliverStub;
		let onStub;
		let isStreamReadyStub;
		let decodeBlockStub;

		let hub; // event service for the stream testing
		beforeEach(() => {
			isStreamReadyStub = sandbox.stub();
			revert.push(EventService.__set__('isStreamReady', isStreamReadyStub));
			decodeBlockStub = sandbox.stub();
			decodeBlockStub.returns(block);
			revert.push(EventService.__set__(' BlockDecoder.decodeBlock', decodeBlockStub));

			onStub = sandbox.stub();
			deliverFilteredStub = sandbox.stub().returns({on: onStub});
			deliverStub = sandbox.stub().returns({on: onStub});
			eventProtoDeliverStub = sandbox.stub().returns({deliverFiltered: deliverFilteredStub, deliver: deliverStub});
			revert.push(EventService.__set__('fabprotos.protos.Deliver', eventProtoDeliverStub));

			hub = new EventService('myhub', channel);
		});

		it('throws if eventer stream is running', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.stream = sinon.stub();
			await eventService._startService(eventer1).should.be.rejectedWith('Event service eventer1 is currently listening');
		});
		it('throws if eventer is not connected', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.checkConnection = sinon.stub().returns(false);
			await eventService._startService(eventer1).should.be.rejectedWith('Event service eventer1 is not connected');
		});
		it('throws timeout on stream', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.endpoint = endpoint;
			eventer1.checkConnection = sinon.stub().returns(true);
			const stream = sinon.stub();
			stream.on = sinon.stub();
			stream.write = sinon.stub();
			eventer1.setStreamByType = function() {
				this.stream = stream;
			};
			eventService.blockType = 'full';
			await eventService._startService(eventer1, {}, 10).should.be.rejectedWith('Event service timed out - Unable to start listening');
		});
		it('throws error on stream write', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.endpoint = endpoint;
			eventer1.checkConnection = sinon.stub().returns(true);
			const stream = sinon.stub();
			stream.on = sinon.stub();
			stream.write = sinon.stub().throws(Error('failed write'));
			eventer1.setStreamByType = function() {
				this.stream = stream;
			};
			eventService.blockType = 'full';
			await eventService._startService(eventer1, {}, 10).should.be.rejectedWith('failed write');
		});
		it('rejects error on stream receive error', async () => {
			util.inherits(Writer, Writable);
			function Writer(opt) {
				Writable.call(this, opt);
			}
			Writer.prototype._write = function(data, encoding, callback) {
				const myErr = new Error('ForcedError');
				myErr.code = 14;
				callback(myErr);
			};
			const stream = new Writer({objectMode: true});
			const eventer1 = client.newEventer('eventer1');
			eventer1.endpoint = endpoint;
			eventer1.checkConnection = sinon.stub().returns(true);
			eventer1.setStreamByType = function() {
				this.stream = stream;
			};
			eventService.blockType = 'full';
			await eventService._startService(eventer1, {}, 10).should.be.rejectedWith('ForcedError');
		});
		it('should call stream on data and log about an unknown response', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.checkConnection = sinon.stub().returns(true);
			eventer1.waitForReady = sandbox.stub().resolves();
			await eventer1.connect(endpoint);
			hub.blockType = 'full';
			onStub.yields({Type: 'unknown'});
			// TEST CALL
			await hub._startService(eventer1, {}, 3000);
			sinon.assert.called(deliverStub);
			sinon.assert.calledWith(FakeLogger.error, 'on.data - unknown deliverResponse type %s', 'unknown');
		});
		it('should call stream on data and log about a block response with no listeners', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.checkConnection = sinon.stub().returns(true);
			eventer1.waitForReady = sandbox.stub().resolves();
			await eventer1.connect(endpoint);
			hub.blockType = 'full';
			onStub.yields({Type: 'block', block: 'place holder' });
			// TEST CALL
			await hub._startService(eventer1, {}, 3000);
			sinon.assert.called(deliverStub);
			sinon.assert.calledWith(FakeLogger.debug, 'on.data - incoming block number 1');
		});
		it('should call stream on data and log about a block response with matching endblock', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.checkConnection = sinon.stub().returns(true);
			eventer1.waitForReady = sandbox.stub().resolves();
			await eventer1.connect(endpoint);
			hub.blockType = 'full';
			hub.end_block = Long.fromValue(1);
			onStub.yields({Type: 'block', block: 'place holder' });
			hub._close = sinon.stub();
			// TEST CALL
			await hub._startService(eventer1, {}, 3000);
			sinon.assert.called(deliverStub);
			sinon.assert.called(hub._close);
			sinon.assert.calledWith(FakeLogger.debug, 'on.data - incoming block number 1');
		});
		it('should call stream on data and catch an error', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.checkConnection = sinon.stub().returns(true);
			eventer1.waitForReady = sandbox.stub().resolves();
			await eventer1.connect(endpoint);
			hub.blockType = 'full';
			onStub.yields({Type: 'block', block: 'place holder' });
			hub._close = sinon.stub();
			hub._processEndBlock = sinon.stub().throws(Error('onData Error'));
			// TEST CALL
			await hub._startService(eventer1, {}, 3000);
			sinon.assert.called(deliverStub);
			sinon.assert.called(hub._close);
			sinon.assert.calledWith(FakeLogger.error, '_startService[myhub] EventService has detected an error Error: onData Error');
		});
		it('should call stream on data with status and end block seen and newest block seen', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.checkConnection = sinon.stub().returns(true);
			eventer1.waitForReady = sandbox.stub().resolves();
			await eventer1.connect(endpoint);
			hub.blockType = 'full';
			onStub.yields({Type: 'status', status: 'SUCCESS' });
			hub._close = sinon.stub();
			hub.end_block_seen = true;
			hub.lastBlockNumber = Long.fromValue(1);
			hub.ending_block = 'newest';
			// TEST CALL
			await hub._startService(eventer1, {}, 3000);
			sinon.assert.called(deliverStub);
			sinon.assert.called(hub._close);
			sinon.assert.calledWith(FakeLogger.debug, '%s - on.data received type status of SUCCESS');
			sinon.assert.calledWith(FakeLogger.debug, 'on.data - status received after last block seen: %s block_num:');
			sinon.assert.calledWith(FakeLogger.debug, 'on.data - status received when newest block seen: %s block_num:');			
		});
		it('should call stream on data with type status of SUCCESS', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.checkConnection = sinon.stub().returns(true);
			eventer1.waitForReady = sandbox.stub().resolves();
			await eventer1.connect(endpoint);
			hub.blockType = 'full';
			onStub.yields({Type: 'status', status: 'SUCCESS' });
			hub._close = sinon.stub();
			// TEST CALL
			await hub._startService(eventer1, {}, 3000);
			sinon.assert.called(deliverStub);
			sinon.assert.notCalled(hub._close);
			sinon.assert.calledWith(FakeLogger.debug, '%s - on.data received type status of SUCCESS');
		});
		it('should call stream on data with type status of not SUCCESS', async () => {
			const eventer1 = client.newEventer('eventer1');
			eventer1.checkConnection = sinon.stub().returns(true);
			eventer1.waitForReady = sandbox.stub().resolves();
			await eventer1.connect(endpoint);
			hub.blockType = 'full';
			onStub.yields({Type: 'status', status: 'BAD' });
			hub._close = sinon.stub();
			// TEST CALL
			await hub._startService(eventer1, {}, 3000);
			sinon.assert.called(deliverStub);
			sinon.assert.called(hub._close);
			sinon.assert.calledWith(FakeLogger.error, 'on.data - unexpected deliverResponse status received - %s');
		});
	});

	describe('#isListening', () => {
		it('should return true', () => {
			eventService.eventer = sinon.stub();
			eventService.eventer.isStreamReady = sinon.stub().returns(true);
			const results = eventService.isListening();
			results.should.be.true;
		});
		it('should return false', () => {
			eventService.eventer = sinon.stub();
			eventService.eventer.isStreamReady = sinon.stub().returns(false);
			const results = eventService.isListening();
			results.should.be.false;
		});
		it('should return false when no eventer assigned', () => {
			const results = eventService.isListening();
			results.should.be.false;
		});
	});

	describe('#_closeAllCallbacks', () => {
		it('should run when no event registrations', () => {
			eventService._closeAllCallbacks();
			sinon.assert.calledWith(FakeLogger.debug, '%s - end');
		});
		it('should remove call all and remove all registrations', () => {
			const registrations = new Map();
			const eventOnEventStub1 = sinon.stub();
			registrations.set('event1', {onEvent: eventOnEventStub1});
			eventService._eventRegistrations = registrations;
			eventService._closeAllCallbacks();
			sinon.assert.called(eventOnEventStub1);
			sinon.assert.calledWith(FakeLogger.debug, '%s - end');
			sinon.assert.calledWith(FakeLogger.debug, '%s - closing event registration:%s');
			should.equal(registrations.size, 0);
		});
	});

	describe('#_checkBlockNum', () => {
		it('should run when undefined', () => {
			const results = eventService._checkBlockNum();
			should.equal(results, null);
		});
		it('should run when null', () => {
			const results = eventService._checkBlockNum(null);
			should.equal(results, null);
		});
		it('should return newest', () => {
			const results = eventService._checkBlockNum('NEWEST');
			should.equal(results, 'newest');
		});
		it('should return oldest', () => {
			const results = eventService._checkBlockNum('Oldest');
			should.equal(results, 'oldest');
		});
		it('should return 10 Long', () => {
			const results = eventService._checkBlockNum('10');
			results.should.be.deep.equal(Long.fromValue(10));
		});
		it('should return 10 Long', () => {
			const results = eventService._checkBlockNum(10);
			results.should.be.deep.equal(Long.fromValue(10));
		});
	});

	describe('#unregisterEventListener', () => {
		it('should throw if eventListener not given', () => {
			(() => {
				eventService.unregisterEventListener();
			}).should.throw(/Missing eventListener parameter/);
		});
		it('should throw if eventListener not given', () => {
			(() => {
				eventService.unregisterEventListener('bad');
			}).should.throw(/eventListener not found/);
		});
		it('should run when not found', () => {
			const eventListener = new EventListener('block', sinon.stub());
			const registrations = new Map();
			registrations.set(eventListener, eventListener);
			eventService._eventRegistrations = registrations;
			const results = eventService.unregisterEventListener(eventListener);
			should.equal(results, eventService);
			sinon.assert.calledWith(FakeLogger.debug, '%s - end');
		});
		it('should set the have flags', () => {
			const registrations = new Map();
			const eventListener = new EventListener('block', sinon.stub());
			registrations.set(eventListener, eventListener);
			const eventListener1 = new EventListener('block', sinon.stub());
			registrations.set(eventListener1, eventListener1);
			const eventListener2 = new EventListener('tx', sinon.stub(), null, 'txid');
			registrations.set(eventListener2, eventListener2);
			const eventListener3 = new EventListener('chaincode', sinon.stub(), null, 'eventname');
			registrations.set(eventListener3, eventListener3);
			eventService._eventRegistrations = registrations;
			const results = eventService.unregisterEventListener(eventListener);
			should.equal(results, eventService);
			sinon.assert.calledWith(FakeLogger.debug, '%s - end');
			eventService._haveBlockListeners.should.be.true;
			eventService._haveTxListeners.should.be.true;
			eventService._haveChaincodeListeners.should.be.true;
		});
	});

	describe('#registerChaincodeListener', () => {
		it('should throw if eventName not given', () => {
			(() => {
				eventService.registerChaincodeListener();
			}).should.throw(/Missing eventName parameter/);
		});
		it('should throw if callback not given', () => {
			(() => {
				eventService.registerChaincodeListener('eventname');
			}).should.throw(/Missing callback parameter/);
		});
		it('should set the have flag', () => {
			eventService._haveChaincodeListeners.should.be.false;
			eventService.registerChaincodeListener('eventname', sinon.stub());
			eventService._haveChaincodeListeners.should.be.true;
		});
		it('should set the have flag with options', () => {
			eventService._haveChaincodeListeners.should.be.false;
			eventService.registerChaincodeListener('eventname', sinon.stub(), {unregister: false});
			eventService._haveChaincodeListeners.should.be.true;
		});
	});

	describe('#registerBlockListener', () => {
		it('should throw if callback not given', () => {
			(() => {
				eventService.registerBlockListener();
			}).should.throw(/Missing callback parameter/);
		});
		it('should set the have flag', () => {
			eventService._haveBlockListeners.should.be.false;
			eventService.registerBlockListener(sinon.stub());
			eventService._haveBlockListeners.should.be.true;
		});
		it('should set the have flag with options', () => {
			eventService._haveBlockListeners.should.be.false;
			eventService.registerBlockListener(sinon.stub(), {unregister: false});
			eventService._haveBlockListeners.should.be.true;
		});
	});

	describe('#registerTransactionListener', () => {
		it('should throw if txid not given', () => {
			(() => {
				eventService.registerTransactionListener();
			}).should.throw(/Missing txid parameter/);
		});
		it('should throw if callback not given', () => {
			(() => {
				eventService.registerTransactionListener('txid');
			}).should.throw(/Missing callback parameter/);
		});
		it('should set the have flag', () => {
			eventService._haveTxListeners.should.be.false;
			eventService.registerTransactionListener('txid', sinon.stub());
			eventService._haveTxListeners.should.be.true;
		});
		it('should set the have flag', () => {
			eventService._haveTxListeners.should.be.false;
			eventService.registerTransactionListener('txid', sinon.stub(),  {unregister: false});
			eventService._haveTxListeners.should.be.true;
		});
		it('should set the have flag when txid=all unregister false', () => {
			eventService._haveTxListeners.should.be.false;
			const eventListener = eventService.registerTransactionListener('ALL', sinon.stub(),  {unregister: false});
			eventService._haveTxListeners.should.be.true;
			should.equal(eventListener.unregister, false);
			should.equal(eventListener.event, 'all');
		});
		it('should set the have flag when txid=all unregister true', () => {
			eventService._haveTxListeners.should.be.false;
			const eventListener = eventService.registerTransactionListener('ALL', sinon.stub(),  {unregister: true});
			eventService._haveTxListeners.should.be.true;
			should.equal(eventListener.unregister, true);
			should.equal(eventListener.event, 'all');
		});
		it('should set the have flag when txid=all and default options', () => {
			eventService._haveTxListeners.should.be.false;
			const eventListener = eventService.registerTransactionListener('ALL', sinon.stub());
			eventService._haveTxListeners.should.be.true;
			should.equal(eventListener.unregister, false);
			should.equal(eventListener.event, 'all');
		});
	});

	describe('#_processEndBlock', () => {
		it('should do nothing if no block', () => {
			(() => {
				eventService._processEndBlock();
			}).should.throw(/Missing block_num parameter/);
		});
		it('should do nothing if no registrations', () => {
			eventService._processEndBlock('block_num');
			sinon.assert.calledWith(FakeLogger.debug, '%s - end');
		});
		it('should do nothing if no end block defined', () => {
			eventService.registerBlockListener(sinon.stub());
			eventService._processEndBlock('block');
			sinon.assert.calledWith(FakeLogger.debug, '%s - %s, no end block defined');
		});
		it('should call the callback with the block number', () => {
			const callback1 = sinon.stub();
			eventService.registerBlockListener(callback1, {endBlock: 10});
			eventService.registerBlockListener(callback1, {endBlock: 10});
			eventService._processEndBlock(Long.fromValue(10));
			sinon.assert.calledWith(FakeLogger.debug, '%s - end');
			sinon.assert.called(callback1);
		});
	});

	describe('#_processBlockEvents', () => {
		it('should do nothing if no block registration', () => {
			eventService._processBlockEvents();
			sinon.assert.calledWith(FakeLogger.debug, '_processBlockEvents[myhub] - no block listeners');
		});
		it('should do call the block registration', () => {
			const block_callback = sinon.stub();
			const block_reg = eventService.registerBlockListener(block_callback);
			eventService._processBlockEvents('full', 'filtered', 'private_data', 1);
			sinon.assert.calledWith(FakeLogger.debug, '_processBlockEvents[myhub] - calling block listener callback');
			sinon.assert.called(block_callback);
			should.equal(eventService._eventRegistrations.has(block_reg), true);
		});
		it('should do nothing if no block registration', () => {
			const block_callback = sinon.stub();
			const block_reg = eventService.registerBlockListener(block_callback, {unregister: true});
			eventService._processBlockEvents('full', 'filtered', 'private_data', 1);
			sinon.assert.calledWith(FakeLogger.debug, '_processBlockEvents[myhub] - calling block listener callback');
			sinon.assert.called(block_callback);
			should.equal(eventService._eventRegistrations.has(block_reg), false);
		});
	});
});
