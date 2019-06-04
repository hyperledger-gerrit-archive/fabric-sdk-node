/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {format} = require('util');
const testUtil = require('../lib/utils');
const unitUtil = require('../../../unit/util.js');
const {User} = require('fabric-common');

module.exports = function () {
	/*
	The new fabric-base (NodeSDK-base) will remove the channel based API's used
	to build, sign, and send proposals to peers to be endorsed with a new flow based
	on a new object "Proposal". The new flow offers some new advantages
	-- User stateless - uses a new object "TransactionContext" that replaces
		the "TransactionID" and the "UserContext" of the Client instance.
		This new object contains the transaction ID, the nonce, and a "User".
		The context is passed each time a proposal is built and signed.
		This allows the application to control each transactions without having
		to change the client object. The context is reusable, it will recalculate
		a new transaction ID and nonce each time a proposal is built.
		If the application needs to know the transaction ID used on the
		proposal it may get it from the "Proposal" object.
	-- The "proposal" maintains the results of all actions and is ready
		for the next action. The application does not have to dig out the
		correct results from one action to the next.
	-- 
	*/
	this.Then(/^I use only base to call (.+?) on (.+?) of chaincode (.+?) as organization (.+?) on channel (.+?) with args (.+?)$/,
		{timeout: testUtil.TIMEOUTS.LONG_STEP},
		async (cc_fcn, chaincode_version, chaincode_name, org_name, channel_name, args) => {
			const step = 'NodeSDK-Base Endorsement';
			testUtil.logMsg(format('%s - starting for %s, %s, %s', step, chaincode_name, org_name, channel_name));
			try {
				// building a user object will be external to the new NodeSDK-Base
				const user = getUser();

				// This is like the old Client object in that it will be the starting point for
				// building the client objects needed by the application.  The result client
				// instance will be used to create channels and store the client side connection
				// information like the GRPC settings and the client side Mutual TLS cert and key.
				const Client = require('fabric-base');
				const client = new Client('myclient');
				const tlsEnrollment = await getTLS_enrollment(user);
				client.setTlsClientCertAndKey(tlsEnrollment.cert, tlsEnrollment.key);

				// New object for NodeSDK-Base, "TransactionContext", this object
				// combines the old "TransactionID" and the Clients "UserContext"
				// into a single transaction based object needed for giving the
				// endorsement transaction an unique transaction ID, and nonce,
				// and also the user identity required when building the outbound
				// request for the fabric network
				// The user identity used must also be a signing identity unless
				// the signing is being done external to the NodeSDK-Base. 
				const txContext = client.newTransactionContext(user);

				// The channel object will be used to represent the peers and orderers
				// and channel event hubs, the fabric network of the channel. Will be used
				// to build any channel related protos (channel header). Will be the focal
				// point for endorsements and queries on the channel. The channel object
				// must be built by the client so that any peer or orderer object created
				// by the discovery action on the channel will be able to get the connection
				// information.
				const channel = client.newChannel(channel_name);

				// The peers and orderers will be built by the client so that common
				// connection information will come from the client object.
				const peer1 = client.newPeer('peer1');
				// unique connection information will be used to build an endpoint
				// used on connect()
				const peer1_endpoint =  client.newEndpoint({
					url: 'grpcs://localhost:7051',
					pem: getPeer1_pem(),
					'ssl-target-name-override': 'peer0.org1.example.com'
				});

				// new call with NodeSDK-Base, the connect will take the unique
				// endpoint settings, like URL and TLS cert of endpoint.
				// The connect call will setup a connection to the fabric service.
				await peer1.connect(peer1_endpoint);

				// build another peer
				const peer2 = client.newPeer('peer2');
				const peer2_endpoint = client.newEndpoint({
					url: 'grpcs://localhost:8051',
					pem: getPeer2_pem(),
					'ssl-target-name-override': 'peer0.org2.example.com'
				});
				await peer2.connect(peer2_endpoint);

				// This is a new object to NodeSDK-Base. This "Proposal" object will
				// centralize the endorsement operation, including the proposal results.
				// Proposals must be built from channel and chaincode name
				const proposal = channel.newProposal(chaincode_name);

				// ----- E N D O R S E -----
				// proposal will have the values needed by the chaincode
				// to perform the endorsement (invoke)
				const build_proposal_request = {
					fcn: cc_fcn,
					args: eval(args)
				};
			
				// The proposal object has the building of the request, the signing
				// and the sending steps broken out into separate API's that must
				// be called individually.
				proposal.buildProposal(txContext, build_proposal_request);
				proposal.signProposal(txContext);

				// Now that the proposal is all built and signed, it is ready
				// to be sent to the endorsing peers.
				// First decide on the peers and a request timeout
				const  endorse_request = {
					targets: [peer1, peer2], // could also use the peer names
										 // if peers have been added to the
										 // channel
					request_timeout: 3000 // optional, use when it is needed to 
									  // control the timeout when you know
									  // the request is going to take longer
									  // than normal
				}

				// New API, the "endorse" method on the proposal object
				// will send the signed proposal to the requested peers.
				const endorse_results = await proposal.endorse(endorse_request);
				if (endorse_results.errors) {
					for (const error of endorse_results.errors) {
						testUtil.logMsg(`Failed to get endorsement for peer ${error.peer.url} : ${error.message}`);
					}
					throw Error('failed endorsement');
				}

				// ----- T R A N S A C T I O N   E V E N T -----
				const channel_event_hub = channel.newChannelEventHub('myhub');

				try {
					// lets connect to the same endpoint that we used for endorsements since
					// the endpoint information is the same however we need to connect to
					// a different service connection.
					await channel_event_hub.connect(peer1_endpoint);
				} catch(error) {
					testUtil.logError(`Failed to connect to receive a transaction event for ${txContext.txId}`);
					testUtil.logError(`Failed to connect ${error.stack}`);
					throw Error('Transaction Event connection problem');
				}

				channel_event_hub.buildStartRequest(txContext);
				channel_event_hub.signStartRequest(txContext);

				const event_listener = new Promise((resolve, reject) => {
					let handle = setTimeout(() => {
						// do the housekeeping when there is a problem
						//channel_event_hub.unregisterTxEvent(txContext.txId);
						reject(new Error('Timed out waiting for block event'));
					}, 20000);
			
					channel_event_hub.registerTxEvent(
						proposal.getEndorsementTransactionId(), 
						(error, tx_id, status, block_num) => {
							clearTimeout(handle);
							if (error) {
								throw error;
							}
							testUtil.logMsg(`Successfully received the transaction event for ${tx_id} with status of ${status} in block number ${block_num}`);
							resolve(`${tx_id} in block ${block_num} is ${status}`);
						},
						{}
					);
					channel_event_hub.startReceiving();
				});

				// ----- C O M M I T -----
				// create an orderer object that will have a reference
				// to the client object to supply connection information
				const orderer = client.newOrderer('orderer');
				// create an endpoint with all the connection information
				const order_endpoint = client.newEndpoint({
					url: 'grpcs://localhost:7050',
					pem: getOrderer_pem(),
					'ssl-target-name-override': 'orderer.example.com'
				});
				testUtil.logMsg(JSON.stringify(order_endpoint.options));
				// new API to have the orderer object connect with the
				// fabric endpoint that it represents.
				try {
					await orderer.connect(order_endpoint)
				} catch(error) {
					// should do something if the connect fails
				}

				// The commit object has each of the steps broken out
				// into API's that may be called individually when signing
				// externally
				// --- the user within the txContext does not have to have the
				//     signing identity, meaning that user object does not have
				//     access to the private key to build the commit protobuf.
				// The buildCommit returns the bytes that may be signed externally
				// instead of signing internally as shown here.
				proposal.buildCommit(txContext);
				// When signing internally the txContext does have to have a
				// user with a signing identity.
				proposal.signCommit(txContext);

				const commit_request = {
					targets: [orderer], // could also use the orderer names
					request_timeout: 3000
				}
				// New API to send the endorsed proposal to the orderer to be committed.
				const commit_submission =  proposal.commit(commit_request);

				// ----- start the event listener and then submit the commit
				// results will be returned with when both promises complete
				const results = await Promise.all([event_listener, commit_submission]);
				testUtil.logMsg(format('%s - commit results %s', step, results[1].status));
				testUtil.logMsg(format('%s - event results %s', step, results[0]));

				// ----- Q U E R Y -----
				// proposal will have the values needed by the chaincode
				// to perform the endorsement (query)
				const build_query_request = {
					fcn: 'query',
					args: 'a'
				};
			
				// The proposal object has the building of the request, the signing
				// and the sending steps broken out into separate API's that must
				// be called individually.
				proposal.buildQuery(txContext, build_query_request);
				proposal.signQuery(txContext);

				// Now that the proposal is all built and signed, it is ready
				// to be sent to the endorsing peers.
				// First decide on the peers and a request timeout
				const  query_request = {
					targets: [peer1, peer2],
					// optional, use when it is needed to control the timeout when you know
					// the request is going to take longer than normal
					request_timeout: 3000
				}

				// New API, the "query" method on the proposal object
				// will send the signed proposal to the requested peers.
				const query = await proposal.query(query_request);
				if (query.errors) {
					for (const error of query.errors) {
						testUtil.logMsg(`Failed to get query results from peer ${error.peer.url} : ${error.message}`);
					}
					throw Error('failed query');
				} else {
					for (const result of query.results) {
						testUtil.logMsg(` *** query results:: ${result.toString('utf8')}`)
					}
				}

				// FIXME ... need these to be in a finally
				peer1.close();
				peer2.close();
				orderer.close();
				channel_event_hub.close();
			} catch(error) {
				testUtil.logError('Test failed ' + step + ' with ::' + error.stack);
				throw Error('FAILED');
			}
			testUtil.logMsg('BASIC FLOW TEST COMPLETE');
		});

	this.Then(/^I use base to call discovery on peer1$/,
		{timeout: testUtil.TIMEOUTS.LONG_STEP},
		async () => {
			const step = 'NodeSDK-Base Discovery';
			testUtil.logMsg(format('%s - starting for Discovery', step));
			try {
				const user = getUser();
				const Client = require('fabric-base');
				const client = new Client('myclient');
				const tlsEnrollment = await getTLS_enrollment(user);
				client.setTlsClientCertAndKey(tlsEnrollment.cert, tlsEnrollment.key);
				const txContext = client.newTransactionContext(user);
				const peer1 = client.newPeer('peer1');
				const peer1_endpoint =  client.newEndpoint({
					url: 'grpcs://localhost:7051',
					pem: getPeer1_pem(),
					'ssl-target-name-override': 'peer0.org1.example.com'
				});

				// ----- D I S C O V E R Y -----
				// Working with the peer's discovery service will be
				// a new class "Discovery".
				const discovery = client.newDiscovery('mydiscovery');
				try {
					await discovery.connect(peer1_endpoint); // use the same endpoint
					discovery.buildRequest(txContext, {config: true, channelId: 'tokenchannel', local: true});
					discovery.signRequest(txContext);
					const results = await discovery.discover({request_timeout: 2000, as_localhost: true});
					testUtil.logMsg('Discovery results :: ' + JSON.stringify(results));
					const results2 = await discovery.discover({request_timeout: 2000, as_localhost: true});
					testUtil.logMsg('\n\nDiscovery results again :: ' + JSON.stringify(results2));
				} catch(error) {
					testUtil.logMsg(format('%s - discovery error: %s', step, error));
				} finally {
					peer1.close();
				}
			} catch(error) {
				testUtil.logError('Test failed ' + step + ' with ::' + error.stack);
				throw Error('Discovery FAILED');
			}
			testUtil.logMsg('DISCOVERY TEST COMPLETE');
		});
	};


function getPeer1_pem() {
	const data = fs.readFileSync(path.join(__dirname, '../../../fixtures/crypto-material/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/msp/tlscacerts/tlsca.org1.example.com-cert.pem'));
	const pem = Buffer.from(data).toString();
	return pem;
}

function getPeer2_pem() {
	const data = fs.readFileSync(path.join(__dirname, '../../../fixtures/crypto-material/crypto-config/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/msp/tlscacerts/tlsca.org2.example.com-cert.pem'));
	const pem = Buffer.from(data).toString();
	return pem;
}

function getOrderer_pem() {
	const data = fs.readFileSync(path.join(__dirname, '../../../fixtures/crypto-material/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem'));
	const pem = Buffer.from(data).toString();
	return pem;
}

function getUser() {
	let data = fs.readFileSync(path.join(__dirname, '../crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/key.pem'));
	let keyPEM = Buffer.from(data).toString();
	data = fs.readFileSync(path.join(__dirname, '../crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/Admin@org1.example.com-cert.pem'));
	let certPEM = Buffer.from(data).toString();

	let user_opts = {
		name: 'admin',
		password: 'adminpw',
		mspid: 'Org1MSP',
		privateKeyPEM: keyPEM,
		signedCertPEM: certPEM
	};
	const user = User.createUser(user_opts);
	return user;
}

async function getTLS_enrollment(user) {
	let data = fs.readFileSync(path.join(__dirname, '../../../fixtures/crypto-material/crypto-config/peerOrganizations/org1.example.com/ca/ca.org1.example.com-cert.pem'));
	let pem = Buffer.from(data).toString();
	const tls_options = {
		trustedRoots: [pem],
		verify: false
	};

	const ca_service_impl = require('fabric-ca-client');
	const ca_service = new ca_service_impl({
		url: 'https://localhost:7054',
		tlsOptions: tls_options,
		caName: 'ca-org1',
		cryptoSuite: user.getCryptoSuite()
	});


	const request = {
		enrollmentID: user.getName(),
		enrollmentSecret: user.getEnrollmentSecret(),
		profile: 'tls'
	};
	const result = await ca_service.enroll(request);
	const enrollment = {
		key: result.key.toBytes(),
		cert: result.certificate
	}

	return enrollment;
};
