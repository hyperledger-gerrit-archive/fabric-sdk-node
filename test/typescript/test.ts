/**
 * Copyright Zhao Chaoyi. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra';
import * as Long from 'long';
import * as path from 'path';
import * as test from 'tape';
import * as util from 'util';

import FabricCAServices = require('fabric-ca-client');
import Client = require('fabric-client');
import FabricCommon = require('fabric-common');

const {Utils: utils} = FabricCommon;
const logger = utils.getLogger('connection profile');

import {IEnrollmentRequest} from 'fabric-ca-client';
import {
	Block,
	BlockchainInfo,
	BroadcastResponse,
	Chaincode,
	ChaincodeInstallRequest,
	ChaincodeInstallRequestv1,
	ChaincodeInstantiateUpgradeRequest,
	ChaincodeInvokeRequest,
	ChaincodePackageRequest,
	ChaincodeQueryRequest,
	ChaincodeQueryResponse,
	ChaincodeRequest,
	Channel,
	ChannelEventHub,
	ChannelQueryResponse,
	ChannelRequest,
	ConfigSignature,
	EndorsementResults,
	ICryptoKeyStore,
	ICryptoSuite,
	JoinChannelRequest,
	Orderer,
	OrdererRequest,
	Peer,
	Proposal, ProposalErrorResponse,
	ProposalResponse,
	ProposalResponseObject,
	QueryApprovalStatusRequest,
	QueryChaincodeDefinitionRequest,
	QueryInstalledChaincodeRequest,
	QueryInstalledChaincodeResult,
	QueryInstalledChaincodesRequest,
	QueryNamespaceDefinitionsRequest,
	TransactionId,
	TransactionRequest,
	User,
} from 'fabric-client';

const configPath: string = path.join(__dirname, '../fixtures/profiles');
const configNetwork: string = path.resolve(configPath, 'network-ts.yaml');
const configOrg1: string = path.resolve(configPath, 'org1.yaml');
const configOrg2: string = path.resolve(configPath, 'org2.yaml');
const channelName: string = 'mychannelts';

test('\n\n ** test TypeScript **', (t: any) => {
	const client: Client = new Client();
	t.equal(client.constructor.name, 'Client');

	let p: Peer = client.newPeer('grpc://localhost:7051');
	t.equal(p.constructor.name, 'Peer');

	p = new Peer('grpc://localhost:7051');
	t.equal(p.constructor.name, 'Peer');

	const u: User = new User('testUser');
	t.equal(u.constructor.name, 'User');

	let o: Orderer = new Orderer('grpc://localhost:7050');
	t.equal(o.constructor.name, 'Orderer');

	o = client.newOrderer('grpc://localhost:7050');
	t.equal(o.constructor.name, 'Orderer');

	const channel: Channel = new Channel('mychannel', client);
	t.equal(channel.constructor.name, 'Channel');

	const ceh = new ChannelEventHub(channel, p);
	t.equal(ceh.constructor.name, 'ChannelEventHub');

	const cc: Chaincode = new Chaincode('name', 'version', client);
	t.equal(cc.constructor.name, 'Chaincode');
	const cc2: Chaincode = client.newChaincode('name', 'version');
	t.equal(cc2.constructor.name, 'Chaincode');

	t.pass('Pass all Class check');
	t.end();
});

test('test-crypto-key-store', (t: any) => {
	const store: ICryptoKeyStore = Client.newCryptoKeyStore();
	const cryptoSuite: ICryptoSuite = Client.newCryptoSuite();
	cryptoSuite.setCryptoKeyStore(store);
	t.end();
});

test('use the connection profile file', async (t: any) => {
	let client = await Client.loadFromConfig(configNetwork);
	t.pass('Successfully load config from network.yaml');

	await client.loadFromConfig(configOrg1);

	let config: Buffer;
	const signatures: any[] = [];
	let channel: Channel;
	let channelRequest: ChannelRequest;
	let genesisBlock: any;
	let proposalResponseObject: ProposalResponseObject;
	let responsePayloads: Buffer[];
	let txId: TransactionId;
	let ordererRequest: OrdererRequest;
	let queryTxId: string;
	let block: Block;
	let enrollment: FabricCAServices.IEnrollResponse;
	let broadcastResponse: BroadcastResponse;
	let proposalResponses: Array<ProposalResponse | ProposalErrorResponse>;
	let proposalResponse: ProposalResponse | ProposalErrorResponse;
	let admin: User;
	let secret: string;
	let channelQueryResponse: ChannelQueryResponse;
	let chaincodeQueryResponse: ChaincodeQueryResponse;
	let blockchainInfo: BlockchainInfo;
	let processedTransaction;
	let found: boolean;
	let configSignature: ConfigSignature;
	let stringSignature: string;
	let fabricCAServices: FabricCAServices;
	let enrollmentRequest: IEnrollmentRequest;
	let joinChannelRequest: JoinChannelRequest;
	let chaincodeInvokeRequest: ChaincodeInvokeRequest;
	let chaincodeInstallRequestv1: ChaincodeInstallRequestv1;
	let chaincodeInstantiateUpgradeRequest: ChaincodeInstantiateUpgradeRequest;
	let transactionRequest: TransactionRequest;
	let proposal: Proposal;
	await client.initCredentialStores();

	t.pass('Successfully created the key value store and crypto store based on the sdk config and connection profile');
	const envelopeBytes = fs.readFileSync(path.join(__dirname, '../fixtures/crypto-material/channel-config/mychannelts.tx'));
	config = client.extractChannelConfig(envelopeBytes);

	configSignature = client.signChannelConfig(config);

	t.pass('Successfully signed config update by org1');
	// collect signature from org1 admin
	stringSignature = configSignature.toBuffer().toString('hex');
	signatures.push(stringSignature);
	t.pass('Successfully extracted the config update from the configtx envelope');
	await client.loadFromConfig(configOrg2);

	t.pass('Successfully loaded the client configuration for org2');

	await client.initCredentialStores();

	t.pass('Successfully set the stores for org2');
	fabricCAServices = client.getCertificateAuthority();
	enrollmentRequest = {
		enrollmentID: 'admin',
		enrollmentSecret: 'adminpw',
		profile: 'tls',
	};
	enrollment = await fabricCAServices.enroll(enrollmentRequest);

	t.pass('Successfully called the CertificateAuthority to get the TLS material for org2');

	// set the material on the client to be used when building endpoints for the user
	client.setTlsClientCertAndKey(enrollment.certificate, enrollment.key.toBytes());

	configSignature = client.signChannelConfig(config);
	t.pass('Successfully signed config update by org2');
	// collect signature from org2 admin
	signatures.push(configSignature);
	t.pass('Successfully extracted the config update from the configtx envelope');

	txId = client.newTransactionID(true);
	// build up the create request
	channelRequest = {
		config,
		name: channelName,
		orderer: 'orderer.example.com', //this assumes we have loaded a connection profile
		signatures,
		txId,
	};
	broadcastResponse = await client.createChannel(channelRequest); //logged in as org2

	logger.debug('\n***\n completed the create \n***\n');

	logger.debug(' response ::%j', broadcastResponse);
	t.pass('Successfully send create channel request');
	if (broadcastResponse.status && broadcastResponse.status === 'SUCCESS') {
		await sleep(10000);
	} else {
		t.fail('Failed to create the channel');
		throw new Error('Failed to create the channel. ');
	}

	t.pass('Successfully waited to make sure new channel was created.');
	channel = client.getChannel(channelName);

	txId = client.newTransactionID(true);
	ordererRequest = {txId};
	block = await channel.getGenesisBlock(ordererRequest);

	t.pass('Successfully got the genesis block');
	genesisBlock = block;

	txId = client.newTransactionID(true);
	joinChannelRequest = {
		//targets: // this time we will leave blank so that we can use
		// all the peers assigned to the channel ...some may fail
		// if the submitter is not allowed, let's see what we get
		block,
		txId,
	};
	proposalResponses = await channel.joinChannel(joinChannelRequest); //admin from org2

	// first of the results should not have good status as submitter does not have permission

	proposalResponse = proposalResponses[0];
	if (proposalResponse instanceof Error || proposalResponse.response.status !== 200) {
		t.pass(' Submitter on "org2" Failed to have peer on org1 channel');
	} else {
		t.fail('Successfully had peer in organization org1 join the channel');
		throw new Error('Should not have been able to join channel with this submitter');
	}

	// second of the results should have good status
	proposalResponse = proposalResponses[1];
	if (proposalResponse instanceof Error || proposalResponse.response.status !== 200) {
		t.fail(' Failed to join channel');
		throw new Error('Failed to join channel');
	} else {
		t.pass('Successfully had peer in organization org2 join the channel');
	}

	/*
	 * switch to organization org1 (recreate client)
	 */
	client = await Client.loadFromConfig(configNetwork);

	await client.loadFromConfig(configOrg1);
	t.pass('Successfully loaded \'admin\' for org1');
	await client.initCredentialStores();

	t.pass('Successfully created the key value store and crypto store based on the config and connection profile');
	fabricCAServices = client.getCertificateAuthority();
	const req: IEnrollmentRequest = {
		enrollmentID: 'admin',
		enrollmentSecret: 'adminpw',
		profile: 'tls',
	};
	enrollment = await fabricCAServices.enroll(req);
	t.pass('Successfully called the CertificateAuthority to get the TLS material for org1');
	const key = enrollment.key.toBytes();
	const cert = enrollment.certificate;

	// set the material on the client to be used when building endpoints for the user
	client.setTlsClientCertAndKey(cert, key);
	channel = client.getChannel(channelName);

	txId = client.newTransactionID(true);
	joinChannelRequest = {
		block: genesisBlock,
		// this does assume that we have loaded a connection profile with a peer by this name
		targets: ['peer0.org1.example.com'],
		txId,
	};

	proposalResponses = await channel.joinChannel(joinChannelRequest); //logged in as org1
	proposalResponse = proposalResponses[0];
	if (proposalResponse instanceof Error || proposalResponse.response.status !== 200) {
		t.fail(' Failed to join channel on org1');
		throw new Error('Failed to join channel on org1');
	} else {
		t.pass(util.format('Successfully had peer in organization %s join the channel', 'org1'));
	}
	await sleep(10000);

	t.pass('Successfully waited for peers to join the channel');
	process.env.GOPATH = path.join(__dirname, '../fixtures/chaincode/goLang');
	logger.debug(`Set GOPATH to ${process.env.GOPATH}`);
	txId = client.newTransactionID(true);
	// send proposal to endorser
	chaincodeInstallRequestv1 = {
		chaincodeId: 'examplets',
		chaincodePath: 'github.com/example_cc',
		chaincodeVersion: 'v1',
		channelNames: 'mychannelts', //targets will based on peers in this channel
		targets: ['peer0.org1.example.com'],
		txId,
	};

	proposalResponseObject = await client.installChaincode(chaincodeInstallRequestv1);

	proposalResponse = proposalResponseObject[0][0];
	if (proposalResponse instanceof Error || proposalResponse.response.status !== 200) {
		t.fail(' Failed to install chaincode on org1');
		logger.debug('Failed due to: %j', proposalResponseObject);
		throw new Error('Failed to install chain code on org1');
	}
	t.pass('Successfully installed chain code on org1');

	await client.loadFromConfig(configOrg2);
	t.pass('Successfully loaded \'admin\' for org2');
	await client.initCredentialStores();

	t.pass('Successfully loaded the client configuration for org2');
	txId = client.newTransactionID(true);
	// send proposal to endorser
	chaincodeInstallRequestv1 = {
		chaincodeId: 'examplets',
		chaincodePath: 'github.com/example_cc',
		chaincodeVersion: 'v1',
		channelNames: 'mychannelts', //targets will based on peers in this channel
		targets: ['peer0.org2.example.com'],
		txId,
	};

	proposalResponseObject = await client.installChaincode(chaincodeInstallRequestv1);

	proposalResponse = proposalResponseObject[0][0];
	if (proposalResponse instanceof Error || proposalResponse.response.status !== 200) {
		t.fail(' Failed to install chaincode on org2');
		logger.debug('Failed due to: %j', proposalResponseObject);
		throw new Error('Failed to install chain code on org2');
	}
	t.pass('Successfully installed chain code on org2');

	// Back to org1 for instantiation
	await client.loadFromConfig(configOrg1);
	t.pass('Successfully loaded \'admin\' for org1');
	await client.initCredentialStores();

	/*
	 *  I N S T A N T I A T E
	 */
	txId = client.newTransactionID(true);
	chaincodeInstantiateUpgradeRequest = {
		args: ['a', '100', 'b', '200'],
		chaincodeId: 'examplets',
		chaincodeVersion: 'v1',
		fcn: 'init',
		txId,
	};

	proposalResponseObject = await channel.sendInstantiateProposal(chaincodeInstantiateUpgradeRequest); // still have org2 admin signer

	proposalResponses = proposalResponseObject[0];

	proposalResponse = proposalResponses[0];
	if (proposalResponse instanceof Error || proposalResponse.response.status !== 200) {
		t.fail('Failed to send  Proposal or receive valid response. Response null or status is not 200. exiting...');
		throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
	}

	t.pass('Successfully sent Proposal and received ProposalResponse');
	transactionRequest = {
		proposal: proposalResponseObject[1],
		proposalResponses: proposalResponses as ProposalResponse[],
		txId, //required to indicate that this is an admin transaction
		//orderer : not specifying, the first orderer defined in the
		//          connection profile for this channel will be used
	};

	broadcastResponse = await channel.sendTransaction(transactionRequest); // still have org2 admin as signer
	if (!(broadcastResponse instanceof Error) && broadcastResponse.status === 'SUCCESS') {
		t.pass('Successfully sent transaction to instantiate the chaincode to the orderer.');
		await sleep(10000);
	} else {
		t.fail('Failed to order the transaction to instantiate the chaincode. Error code: ' + broadcastResponse.status);
		throw new Error('Failed to order the transaction to instantiate the chaincode. Error code: ' + broadcastResponse.status);
	}
	t.pass('Successfully waited for chaincode to startup');

	/*
	 *  S T A R T   U S I N G
	 */
	/*
	 * switch to organization org2
	 */

	await client.loadFromConfig('test/fixtures/profiles/org2.yaml');

	await client.initCredentialStores();
	t.pass('Successfully created the key value store  and crypto store based on the config and connection profile');

	fabricCAServices = client.getCertificateAuthority();
	if (fabricCAServices) {
		t.equals(fabricCAServices.getCaName(), 'ca-org2', 'checking that caname is correct for the newly created ca');
	} else {
		t.fail('Failed - CertificateAuthority should have been created');
	}

	/*
	 * switch to organization org1
	 */
	await client.loadFromConfig('test/fixtures/profiles/org1.yaml');
	t.pass('Successfully loaded config for org1');

	await client.initCredentialStores();
	t.pass('Successfully created the key value store and crypto store based on the config and network');

	admin = await client.setUserContext({username: 'admin', password: 'adminpw'});
	t.pass('Successfully enrolled user \'admin\' for org1');

	fabricCAServices = client.getCertificateAuthority();
	if (fabricCAServices) {
		t.equals(fabricCAServices.getCaName(), 'ca-org1', 'checking that caname is correct after resetting the config');
	} else {
		t.fail('Failed - CertificateAuthority should have been created');
	}

	secret = await fabricCAServices.register({enrollmentID: 'user2', affiliation: 'org1'}, admin);
	t.pass('Successfully registered user \'user2\' for org1');

	await client.setUserContext({username: 'user2', password: secret});
	t.pass('Successfully enrolled user \'user2\' for org1');

	// try again ...this time use a longer timeout
	txId = client.newTransactionID(); // get a non admin transaction ID
	queryTxId = txId.getTransactionID(); //save transaction string for later
	chaincodeInvokeRequest = {
		args: ['a', 'b', '100'],
		chaincodeId: 'examplets',
		fcn: 'move',
		txId,
		//targets - Letting default to all endorsing peers defined on the channel in the connection profile
	};

	proposalResponseObject = await channel.sendTransactionProposal(chaincodeInvokeRequest); //logged in as org1 user

	proposalResponses = proposalResponseObject[0];
	proposal = proposalResponseObject[1];
	let allGood = true;
	// Will check to be sure that we see two responses as there are two peers defined on this
	// channel that are endorsing peers
	let endorsedResponses = 0;
	for (const proposalResponseTemp of proposalResponses) {
		endorsedResponses++;
		if (proposalResponseTemp instanceof Error || !proposalResponseTemp.response || !proposalResponseTemp.response.status) {
			t.fail('transaction response was unknown');
			logger.error('transaction response was unknown %s', proposalResponseTemp);
			allGood = false;
		} else if (proposalResponseTemp.response.status !== 200) {
			t.fail('transaction proposal was bad');
			t.comment(' response status:' + proposalResponseTemp.response.status +
				' message:' + proposalResponseTemp.response.message);
			allGood = false;
		} else {
			t.pass('transaction proposal has response status of good');
		}
	}
	t.equals(endorsedResponses, 2, 'Checking that there are the correct number of endorsed responses');
	if (!allGood) {
		t.fail('Failed to send invoke Proposal or receive valid response. Response null or status is not 200. exiting...');
		throw new Error('Failed to send invoke Proposal or receive valid response. Response null or status is not 200. exiting...');
	}
	transactionRequest = {
		proposal,
		proposalResponses: proposalResponses as ProposalResponse[],
	};

	const promises = [];

	// be sure to get an channel event hub the current user is authorized to use
	const eventhub = channel.newChannelEventHub('peer0.org1.example.com');

	const txPromise = new Promise((resolve, reject) => {
		const handle = setTimeout(() => {
			eventhub.unregisterTxEvent(queryTxId);
			eventhub.disconnect();
			t.fail('REQUEST_TIMEOUT --- eventhub did not report back');
			reject(new Error('REQUEST_TIMEOUT:' + eventhub.getPeerAddr()));
		}, 30000);

		eventhub.registerTxEvent(queryTxId, (tx, code, blockNum) => {
				clearTimeout(handle);
				if (code !== 'VALID') {
					t.fail('transaction was invalid, code = ' + code);
					reject(new Error('INVALID:' + code));
				} else {
					t.pass('transaction has been committed on peer ' + eventhub.getPeerAddr());
					resolve('COMMITTED');
				}
			}, (error) => {
				clearTimeout(handle);
				t.fail('transaction event failed:' + error);
				reject(error);
			},
			{disconnect: true}, //since this is a test and we will not be using later
		);
	});
	// connect(true) to receive full blocks (user must have read rights to the channel)
	// should connect after registrations so that there is an error callback
	// to receive errors if there is a problem on the connect.
	eventhub.connect(true);

	promises.push(txPromise);
	promises.push(channel.sendTransaction(transactionRequest));

	const broadcastResponses = await Promise.all(promises);
	const sendTransactionResults = broadcastResponses[1] as BroadcastResponse;
	if (sendTransactionResults instanceof Error) {
		t.fail('Failed to order the transaction: ' + sendTransactionResults);
		throw sendTransactionResults;
	} else if (sendTransactionResults.status === 'SUCCESS') {
		t.pass('Successfully sent transaction to invoke the chaincode to the orderer.');
	} else {
		t.fail('Failed to order the transaction to invoke the chaincode. Error code: ' + sendTransactionResults.status);
		throw new Error('Failed to order the transaction to invoke the chaincode. Error code: ' + sendTransactionResults.status);
	}

	await new Promise((resolve, reject) => {
		// get a new ChannelEventHub when registering a listener
		// with startBlock or endBlock when doing a replay
		// The ChannelEventHub must not have been connected or have other
		// listeners.
		const channelEventHub: ChannelEventHub = channel.newChannelEventHub('peer0.org1.example.com');

		const handle = setTimeout(() => {
			t.fail('Timeout - Failed to receive replay the event for event1');
			channelEventHub.unregisterTxEvent(queryTxId);
			channelEventHub.disconnect(); //shutdown down since we are done
		}, 10000);

		channelEventHub.registerTxEvent(queryTxId, (txnid, code, blockNum) => {
				clearTimeout(handle);
				t.pass('Event has been replayed with transaction code:' + code + ' for transaction id:' + txnid + ' for block_num:' + blockNum);
				resolve('Got the replayed transaction');
			}, (error) => {
				clearTimeout(handle);
				t.fail('Failed to receive event replay for Event for transaction id ::' + queryTxId);
				throw (error);
			},
			// a real application would have remembered the last block number
			// received and used that value to start the replay
			// Setting the disconnect to true as we do not want to use this
			// ChannelEventHub after the event we are looking for comes in
			{startBlock: 0, disconnect: true},
		);
		t.pass('Successfully registered transaction replay for ' + queryTxId);

		channelEventHub.connect(); //connect to receive filtered blocks
		t.pass('Successfully called connect on the transaction replay event hub for filtered blocks');
	});
	t.pass('Successfully checked channel event hub replay');

	await new Promise((resolve, reject) => {
		// Get the list of channel event hubs for the current organization.
		// These will be peers with the "eventSource" role setting of true
		// and not the peers that have an "eventURL" defined. Peers with the
		// eventURL defined are peers with the legacy Event Hub that is on
		// a different port than the peer services. The peers with the
		// "eventSource" tag are running the channel-based event service
		// on the same port as the other peer services.
		const channelEventHubs: ChannelEventHub[] = channel.getChannelEventHubsForOrg();
		// we should have the an channel event hub defined on the "peer0.org1.example.com"
		t.equals(channelEventHubs.length, 1, 'Checking that the channel event hubs has one');

		const channelEventHub = channelEventHubs[0];
		t.equals(channelEventHub.getPeerAddr(), 'localhost:7051', ' channel event hub address ');

		const handle = setTimeout(() => {
			t.fail('Timeout - Failed to receive replay the event for event1');
			channelEventHub.unregisterTxEvent(queryTxId);
			channelEventHub.disconnect(); //shutdown down since we are done
		}, 10000);

		channelEventHub.registerTxEvent(queryTxId, (txnid, code, blockNum) => {
				clearTimeout(handle);
				t.pass('Event has been replayed with transaction code:' + code + ' for transaction id:' + txnid + ' for block_num:' + blockNum);
				resolve('Got the replayed transaction');
			}, (error) => {
				clearTimeout(handle);
				t.fail('Failed to receive event replay for Event for transaction id ::' + queryTxId);
				throw (error);
			},
			// a real application would have remembered the last block number
			// received and used that value to start the replay
			// Setting the disconnect to true as we do not want to use this
			// ChannelEventHub after the event we are looking for comes in
			{startBlock: 0, disconnect: true},
		);
		t.pass('Successfully registered transaction replay for ' + queryTxId);

		channelEventHub.connect(); //connect to receive filtered blocks
		t.pass('Successfully called connect on the transaction replay event hub for filtered blocks');
	});
	t.pass('Successfully checked replay');
	// check that we can get the user again without password
	// also verifies that we can get a complete user properly stored
	// when using a connection profile
	await client.setUserContext({username: 'admin'});

	t.pass('Successfully loaded user \'admin\' from store for org1');

	const request: ChaincodeQueryRequest = {
		args: ['b'],
		chaincodeId: 'examplets',
		fcn: 'query',
	};

	responsePayloads = await channel.queryByChaincode(request); //logged in as user on org1

	// should only be one response ...as only one peer is defined as CHAINCODE_QUERY_ROLE
	let queryResponses = 0;
	if (responsePayloads) {
		for (const responsePayload of responsePayloads) {
			queryResponses++;
			t.equal(
				responsePayload.toString('utf8'),
				'300',
				'checking query results are correct that user b has 300 now after the move');
		}
	} else {
		t.fail('response_payloads is null');
		throw new Error('Failed to get response on query');
	}
	t.equals(queryResponses, 1, 'Checking that only one response was seen');

	channelQueryResponse = await client.queryChannels('peer0.org1.example.com');
	logger.debug(' queryChannels ::%j', channelQueryResponse);
	found = false;
	for (const resultChannel of channelQueryResponse.channels) {
		logger.debug(' queryChannels has found %s', resultChannel.channel_id);
		if (resultChannel.channel_id === channelName) {
			found = true;
		}
	}
	if (found) {
		t.pass('Successfully found our channel in the result list');
	} else {
		t.fail('Failed to find our channel in the result list');
	}

	chaincodeQueryResponse = await client.queryInstalledChaincodes('peer0.org1.example.com', true); // use admin
	logger.debug(' queryInstalledChaincodes ::%j', chaincodeQueryResponse);
	found = false;
	for (const resultChaincode of chaincodeQueryResponse.chaincodes) {
		logger.debug(' queryInstalledChaincodes has found %s', resultChaincode.name);
		if (resultChaincode.name === 'examplets') {
			found = true;
		}
	}
	if (found) {
		t.pass('Successfully found our chaincode in the result list');
	} else {
		t.fail('Failed to find our chaincode in the result list');
	}

	block = await channel.queryBlock(1);
	logger.debug(' queryBlock ::%j', block);
	t.equals('1', block.header.number, 'Should be able to find our block number');

	blockchainInfo = await channel.queryInfo();
	logger.debug(' queryInfo ::%j', blockchainInfo);
	t.equals(3, blockchainInfo.height.low, 'Should be able to find our block height');

	block = await channel.queryBlockByHash(blockchainInfo.previousBlockHash);
	logger.debug(' queryBlockHash ::%j', block);
	t.equals('1', block.header.number, 'Should be able to find our block number by hash');

	processedTransaction = await channel.queryTransaction(queryTxId);
	logger.debug(' queryTransaction ::%j', processedTransaction);
	t.equals(0, processedTransaction.validationCode, 'Should be able to find our transaction validationCode');

	block = await channel.queryBlock(1, 'peer0.org1.example.com');
	logger.debug(' queryBlock ::%j', block);
	t.equals('1', block.header.number, 'Should be able to find our block number with string peer name');

	blockchainInfo = await channel.queryInfo('peer0.org1.example.com');
	logger.debug(' queryInfo ::%j', blockchainInfo);
	t.equals(3, blockchainInfo.height.low, 'Should be able to find our block height with string peer name');

	block = await channel.queryBlockByHash(blockchainInfo.previousBlockHash, 'peer0.org1.example.com');
	logger.debug(' queryBlockHash ::%j', block);
	t.equals('1', block.header.number, 'Should be able to find our block number by hash with string peer name');

	processedTransaction = await channel.queryTransaction(queryTxId, 'peer0.org1.example.com');
	logger.debug(' queryTransaction ::%j', processedTransaction);
	t.equals(0, processedTransaction.validationCode, 'Should be able to find our transaction validationCode with string peer name');

	block = await channel.queryBlock(1, 'peer0.org1.example.com', true);
	logger.debug(' queryBlock ::%j', block);
	t.equals('1', block.header.number, 'Should be able to find our block number by admin');

	blockchainInfo = await channel.queryInfo('peer0.org1.example.com', true);
	logger.debug(' queryInfo ::%j', blockchainInfo);
	t.equals(3, blockchainInfo.height.low, 'Should be able to find our block height by admin');

	block = await channel.queryBlockByHash(blockchainInfo.previousBlockHash, 'peer0.org1.example.com', true);
	logger.debug(' queryBlockHash ::%j', block);
	t.equals('1', block.header.number, 'Should be able to find our block number by hash by admin');

	processedTransaction = await channel.queryTransaction(queryTxId, 'peer0.org1.example.com', true);

	logger.debug(' queryTransaction ::%j', processedTransaction);
	t.equals(0, processedTransaction.validationCode, 'Should be able to find our transaction validationCode by admin');

	txId = client.newTransactionID(); // get a non admin transaction ID
	chaincodeInvokeRequest = {
		args: ['a', 'b', '100'],
		chaincodeId: 'examplets',
		fcn: 'move',
		txId,
		//targets - Letting default to all endorsing peers defined on the channel in the connection profile
	};

	// put in a very small timeout to force a failure, thereby checking that the timeout value was being used
	proposalResponseObject = await channel.sendTransactionProposal(chaincodeInvokeRequest, 1); //logged in as org1 user
	for (const proposalResponseTemp of proposalResponseObject[0]) {
		if (proposalResponseTemp instanceof Error && proposalResponseTemp.toString().indexOf('REQUEST_TIMEOUT') > 0) {
			t.pass('Successfully cause a timeout error by setting the timeout setting to 1');
		} else {
			t.fail('Failed to get the timeout error');
		}
	}

	t.pass('Testing has completed successfully');
	t.end();

});

//-------------------
test('test the new lifecycle APIs', async (t: any) => {
	const client1 = await getClientForOrg(configNetwork, configOrg1);
	const client2 = await getClientForOrg(configNetwork, configOrg2);
	const channel1 = client1.newChannel('tokenchannel');
	const channel2 = client2.newChannel('tokenchannel');

	let data = fs.readFileSync(path.join(__dirname, '../fixtures/crypto-material/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/msp/tlscacerts/tlsca.org1.example.com-cert.pem'));
	let pem = Buffer.from(data).toString();
	const peer1 = client1.newPeer('grpcs://localhost:7051', {
		name: 'peer0.org1.example.com',
		pem,
		['ssl-target-name-override']: 'peer0.org1.example.com',
	});

	data = fs.readFileSync(path.join(__dirname, '../fixtures/crypto-material/crypto-config/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/msp/tlscacerts/tlsca.org2.example.com-cert.pem'));
	pem = Buffer.from(data).toString();
	const peer2 = client2.newPeer('grpcs://localhost:8051', {
		name: 'peer0.org2.example.com',
		pem,
		['ssl-target-name-override']: 'peer0.org2.example.com',
	});

	data = fs.readFileSync(path.join(__dirname, '../fixtures/crypto-material/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem'));
	pem = Buffer.from(data).toString();
	const orderer1 = client1.newOrderer('grpcs://localhost:7050', {
		name: 'orderer.example.com',
		pem,
		['ssl-target-name-override']: 'orderer.example.com',
	});
	channel1.addOrderer(orderer1);
	const orderer2 = client2.newOrderer('grpcs://localhost:7050', {
		name: 'orderer.example.com',
		pem,
		['ssl-target-name-override']: 'orderer.example.com',
	});
	channel2.addOrderer(orderer2);

	// P A C K A G E
	const metadatapath = path.join(__dirname, '../fixtures/chaincode/metadata');
	const chaincodepath = path.join(__dirname, '../fixtures/chaincode/node_cc/example_cc');

	const chaincode1: Chaincode = client1.newChaincode('mychaincode', 'v1');
	const chaincode2: Chaincode = client2.newChaincode('mychaincode', 'v1');

	const packagerequest: ChaincodePackageRequest = {
		chaincodePath: chaincodepath,
		chaincodeType: 'node',
		metadataPath: metadatapath,
	};

	try {
		await chaincode1.package(packagerequest);
		t.pass('Successfully package the chaincode1');
	} catch (error) {
		t.fail('Failed to Package, Error:' + error);
	}

	try {
		await chaincode2.package(packagerequest);
		t.pass('Successfully package the code');
	} catch (error) {
		t.fail('Failed to Package, Error:' + error);
	}

	// I N S T A L L
	const installrequest1: ChaincodeInstallRequest = {
		request_timeout: 10000,
		target: peer1,
	};

	try {
		const packageid = await chaincode1.install(installrequest1);
		t.pass('Successfully installed the code on peer1 with package ID of ' + packageid);
	} catch (error) {
		t.fail('Failed to Install on peer1, Error:' + error);
	}

	const installrequest2: ChaincodeInstallRequest = {
		request_timeout: 10000,
		target: peer2,
	};

	try {
		const packageid = await chaincode2.install(installrequest2);
		t.pass('Successfully installed the code on peer2 with package ID of ' + packageid);
	} catch (error) {
		t.fail('Failed to Install on peer2, Error:' + error);
	}

	// A P P R O V E
	const ENDORSEMENT_POLICY = {
		identities: [
			{role: {name: 'member', mspId: 'Org1MSP'}},
			{role: {name: 'member', mspId: 'Org2MSP'}},
		],
		policy: {
			'1-of': [{'signed-by': 0}, {'signed-by': 1}],
		},
	};
	chaincode1.setEndorsementPolicyDefinition(ENDORSEMENT_POLICY);
	t.pass('Successfully set chaincode1 with endorsement policy');

	const txId1 = client1.newTransactionID(true);
	t.pass('Successfully created TX for peer1:' + txId1.getTransactionID());

	const approverequest1: ChaincodeRequest = {
		chaincode: chaincode1,
		request_timeout: 3000,
		targets: [peer1],
		txId: txId1,
	};

	try {
		const result: EndorsementResults = await channel1.approveChaincodeForOrg(approverequest1);
		for (const response of result.proposalResponses) {
			if (response instanceof Error) {
				throw response;
			} else if (response.response && response.response.status) {
				if (response.response.status === 200) {
					t.pass('Successfully endorsed the approved on peer1 package ID of ' + chaincode1.getPackageId());
				} else {
					throw Error('Problem with the chaincode1 approval' + response.status + ' :: ' + response.message);
				}
			} else {
				throw Error('Problem with the chaincode1 approval no response returned');
			}
		}
		await commitProposal(txId1, result.proposalResponses, result.proposal, channel1, peer1);
	} catch (error) {
		t.fail('Failed to Approve on peer1, Error:' + error);
	}

	chaincode2.setEndorsementPolicyDefinition(ENDORSEMENT_POLICY);
	t.pass('Successfully set chaincode2 with endorsement policy');

	const txId2 = client2.newTransactionID(true);
	t.pass('Successfully created TX for peer2:' + txId2.getTransactionID());

	const approverequest2: ChaincodeRequest = {
		chaincode: chaincode2,
		request_timeout: 3000,
		targets: [peer2],
		txId: txId2,
	};

	try {
		const result: EndorsementResults = await channel2.approveChaincodeForOrg(approverequest2);
		t.pass('Successfully endorsed the approved on peer2 package ID of ' + chaincode2.getPackageId());
		await commitProposal(txId2, result.proposalResponses, result.proposal, channel2, peer2);
	} catch (error) {
		t.fail('Failed to Approve on peer2, Error:' + error);
	}

	const qapprovalstatusrequest: QueryApprovalStatusRequest = {
		chaincode: chaincode1,
		target: peer1,
	};

	try {
		const results = await channel1.queryApprovalStatus(qapprovalstatusrequest);
		t.pass('Successfully queried for approval status' + JSON.stringify(results));
	} catch (error) {
		t.fail('Failed to query for approval status, Error:' + error);
	}

	// C O M M I T
	const txIdc = client1.newTransactionID(true);

	const request = {
		chaincode: chaincode1,
		request_timeout: 3000,
		targets: [peer1, peer2],
		txId: txIdc,
	};

	try {
		const result: EndorsementResults = await channel1.commitChaincode(request);
		t.pass('Successfully endorsed the commit of package ID of ' + chaincode1.getPackageId());
		await commitProposal(txIdc, result.proposalResponses, result.proposal, channel1, peer1);
	} catch (error) {
		t.fail('Failed to Commit, Error:' + error);
	}

	// Q U E R I E S
	const qinstalledchaincoderequest: QueryInstalledChaincodeRequest = {
		package_id: chaincode1.getPackageId(),
		target: peer1,
	};

	try {
		const results: QueryInstalledChaincodeResult = await channel1.queryInstalledChaincode(qinstalledchaincoderequest);
		t.pass('Successfully queried installed chaincode the code with package ID of ' + results.package_id);
	} catch (error) {
		t.fail('Failed to query installed chaincode, Error:' + error);
	}

	const qinstalledchaincodesrequest: QueryInstalledChaincodesRequest = {
		target: peer1,
	};

	try {
		const results: any = await channel1.queryInstalledChaincodes(qinstalledchaincodesrequest);
		t.pass('Successfully queried installed chaincodes the code with package ID of ' + JSON.stringify(results));
	} catch (error) {
		t.fail('Failed to query for installed chaincodes, Error:' + error);
	}

	const qchaincodedefinitionrequest: QueryChaincodeDefinitionRequest = {
		chaincodeId: chaincode1.getName(),
		target: peer1,
	};

	try {
		const result: Chaincode = await channel1.queryChaincodeDefinition(qchaincodedefinitionrequest);
		t.pass('Successfully queried for chaincode definition name:' + result.getName() + ', package_id:' + result.getPackageId());
	} catch (error) {
		t.fail('Failed to query for chaincode definition, Error:' + error);
	}

	const qnamespacedefinitionsrequest: QueryNamespaceDefinitionsRequest = {
		target: peer1,
	};

	try {
		const results = await channel1.queryNamespaceDefinitions(qnamespacedefinitionsrequest);
		t.pass('Successfully queried for namespace definitions ' + JSON.stringify(results));
	} catch (error) {
		t.fail('Failed to query for namespace definition, Error:' + error);
	}

	chaincode1.setSequence(new Long(2));

	const qapprovalstatusrequest2: QueryApprovalStatusRequest = {
		chaincode: chaincode1,
		target: peer1,
	};

	try {
		const results = await channel1.queryApprovalStatus(qapprovalstatusrequest2);
		t.pass('Successfully queried for approval status' + JSON.stringify(results));
	} catch (error) {
		t.fail('Failed to query for approval status, Error:' + error);
	}
	t.end();
});

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getClientForOrg(networkccp: string, orgccp: string) {
	// build a 'Client' instance that knows of a network
	//  this network config does not have the client information, we will
	//  load that later so that we can switch this client to be in a different
	//  organization
	const client = await Client.loadFromConfig(networkccp);

	// load the client information for this organization
	// this file only has the client section
	await client.loadFromConfig(orgccp);

	// tell this client instance where the state and key stores are located
	await client.initCredentialStores();

	const user = new User('admin');
	user.setSigningIdentity(client._getSigningIdentity(true));
	client.setUserContext(user, true);

	// get the CA associated with this client's organization
	// ---- this must only be run after the client has been loaded with a
	// client section of the connection profile
	const caService = client.getCertificateAuthority();

	const request = {
		enrollmentID: 'admin',
		enrollmentSecret: 'adminpw',
		profile: 'tls',
	};
	const enrollment = await caService.enroll(request);

	const key = enrollment.key.toBytes();
	const cert = enrollment.certificate;

	// set the material on the client to be used when building endpoints for the user
	client.setTlsClientCertAndKey(cert, key);

	return client;
}

async function commitProposal(txid: any, proposalResponsesD: any, proposalD: any, channel: any, peer: any) {
	const deployId = txid.getTransactionID();
	const promises = [];
	const request = {
		proposal: proposalD,
		proposalResponses: proposalResponsesD,
		txId: txid,
	};
	promises.push(channel.sendTransaction(request));

	const channeleventhub = channel.newChannelEventHub(peer);
	const txPromise = new Promise((resolve, reject) => {
		const handle = setTimeout(() => {
			channeleventhub.disconnect();
			reject('TIMEOUT waiting on ' + channeleventhub.getPeerAddr());
		}, 120000);

		channeleventhub.registerTxEvent(deployId.toString(), (tx: string, code: string) => {
			clearTimeout(handle);
			if (code !== 'VALID') {
				reject(code);
			} else {
				resolve(code);
			}
		}, (err: any) => {
			clearTimeout(handle);
			reject(err);
		}, {
			disconnect: true,
		});
		channeleventhub.connect();
	});
	promises.push(txPromise);

	let results = null;
	try {
		results = await Promise.all(promises);
	} catch (error) {
		throw error;
	}

	// orderer results are first as it was the first promise
	if (results && results[0]) {
		if (results[0] instanceof Error) {
			throw results[0];
		}
		if (results[0].status) {
			if (results[0].status === 'SUCCESS') {
				if (results[1]) {
					if (results[1] instanceof Error) {
						throw results[1];
					}
					if (results[1] === 'VALID') {
						return true;
					} else {
						throw Error('Transaction was not valid: code=' + results[1]);
					}
				} else {
					throw Error('Event Hub did not provide results');
				}
			} else {
				throw Error('Failed to submit transaction to the orderer, status=' + results[1].status);
			}
		} else {
			throw Error('Failed to submit transaction successfully to the orderer no status');
		}
	}
}
