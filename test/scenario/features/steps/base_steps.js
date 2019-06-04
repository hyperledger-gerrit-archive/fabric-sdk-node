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
	this.Then(/^I use only base to call (.+?) on chaincode (.+?) as organization (.+?) on channel (.+?) with args (.+?)$/,
		{timeout: testUtil.TIMEOUTS.LONG_STEP},
		async (cc_fcn, chaincode_name, org_name, channel_name, args) => {
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
					targets: [peer1, peer2],
					request_timeout: 3000 // optional
				}

				// New API, the "endorse" method on the proposal object
				// will send the signed proposal to the requested peers.
				const endorse_results = await proposal.endorse(endorse_request);
				if (endorse_results.errors) {
					for (const error of endorse_results.errors) {
						testUtil.logMsg(`Failed to get endorsement : ${error.message}`);
					}
					throw Error('failed endorsement');
				}

				// ----- T R A N S A C T I O N   E V E N T -----
				const channel_event_hub = channel.newChannelEventHub('myhub');

				try {
					// same endpoint different service
					await channel_event_hub.connect(peer1_endpoint);
				} catch(error) {
					testUtil.logError(`Failed to connect to receive a transaction event for ${txContext.txId}`);
					testUtil.logError(`Failed to connect ${error.stack}`);
					throw error;
				}

				try {
					const status = await channel_event_hub.checkConnection();
					if (status) {
						testUtil.logMsg('Successfully checked the connection to the event service');
					} else {
						testUtil.logError('Failed to check the connection to the event service');
						throw Error('Transaction Event reconnection problem');
					}
				} catch(error) {
					testUtil.logError(`Failed to reconnect ${error.stack}`);
					throw error;
				}

				channel_event_hub.buildStartRequest(txContext);
				channel_event_hub.signStartRequest(txContext);

				const event_listener = new Promise((resolve, reject) => {
					let handle = setTimeout(() => {
						reject(new Error('Test application has timed out waiting for tx event'));
						// may want to close the event hub or unregister the tx event listener
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
					channel_event_hub.startListening();
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
				const channel = client.newChannel('tokenchannel');
				const tlsEnrollment = await getTLS_enrollment(user);
				client.setTlsClientCertAndKey(tlsEnrollment.cert, tlsEnrollment.key);
				const txContext = client.newTransactionContext(user);
				const peer1_endpoint =  client.newEndpoint({
					url: 'grpcs://localhost:7051',
					pem: getPeer1_pem(),
					'ssl-target-name-override': 'peer0.org1.example.com'
				});

				// ----- D I S C O V E R Y -----
				// Working with the peer's discovery service will be
				// a new class "Discovery".
				const discovery = channel.newChannelDiscovery('mydiscovery');
				try {
					testUtil.logMsg('\n\nDISCOVERY TEST 1 - just config\n');

					await discovery.connect(peer1_endpoint); // use the same endpoint
					// basic test to get a config(msps and orderers) and some local peers
					discovery.buildRequest(txContext);
					discovery.signRequest(txContext);
					const results = await discovery.discover({request_timeout: 2000, as_localhost: true});
					testUtil.logMsg('\nDiscovery test 1 results :: ' + JSON.stringify(results));
					// make sure we can run the same request many times
					const results2 = await discovery.discover({request_timeout: 2000, as_localhost: true});
					testUtil.logMsg('\n\nDiscovery test 1 results again :: ' + JSON.stringify(results2));
				} catch(error) {
					testUtil.logMsg(format('%s - discovery error: %s', step, error));
				} finally {
					discovery.close();
				}

				try {
					testUtil.logMsg('\n\nDISCOVERY TEST 2 - config and endorsement plan\n');

					// make sure we can connect again
					await discovery.connect(peer1_endpoint); // use the same endpoint

					// basic test to get a config(msps and orderers) and some local peers
					discovery.buildRequest(txContext, {interest: [{name: 'example_cc_node'}] });
					discovery.signRequest(txContext);
					const results = await discovery.discover({request_timeout: 2000, as_localhost: true});
					testUtil.logMsg('\nDiscovery test 2 results :: ' + JSON.stringify(results));

					// make sure we can run the same request many times
					const results2 = await discovery.discover({request_timeout: 2000, as_localhost: true});
					testUtil.logMsg('\n\nDiscovery test 2 results again :: ' + JSON.stringify(results2));

					const check_results = JSON.stringify(discovery.getDiscoveryResults());
					if (check_results === JSON.stringify(results2)) {
						testUtil.logMsg('Discovered results are the same');
					} else {
						throw Error('Saved Discover results are not the same');
					}

					// check the peers discovered
					let peers = channel.getPeers(); // gets all peers
					if (await peers[0].checkConnection()) {
						testUtil.logMsg(`Peer ${peers[0].name} is connected`);
					} else {
						throw Error(`Peer ${peers[0].name} is not connected`);
					}

					// check the peers discovered for mspid
					peers = channel.getPeers('Org1MSP'); // gets all peers
					if (await peers[0].checkConnection()) {
						testUtil.logMsg(`Peer ${peers[0].name} is connected`);
					} else {
						throw Error(`Peer ${peers[0].name} is not connected`);
					}

					// check the orderers discovered
					let orderers = channel.getOrderers(); // gets all peers
					if (await orderers[0].checkConnection()) {
						testUtil.logMsg(`Orderer ${orderers[0].name} is connected`);
					} else {
						throw Error(`Orderer ${orderers[0].name} is not connected`);
					}

					// check the orderers discovered for mspid
					orderers = channel.getOrderers('OrdererMSP'); // gets all peers
					if (await orderers[0].checkConnection()) {
						testUtil.logMsg(`Orderer ${orderers[0].name} is connected`);
					} else {
						throw Error(`Orderer ${orderers[0].name} is not connected`);
					}
				} catch(error) {
					testUtil.logMsg(format('%s - discovery error: %s', step, error));
				} finally {
					discovery.close();
				}
			} catch(error) {
				testUtil.logError('Test failed ' + step + ' with ::' + error.stack);
				throw Error('Discovery FAILED');
			}
			testUtil.logMsg('DISCOVERY TEST COMPLETE');
		}
	);

	this.Then(/^I use base to call discovery on peer1 to endorse$/,
		{timeout: testUtil.TIMEOUTS.LONG_STEP},
		async () => {
			const step = 'NodeSDK-Base Discovery Endorsement';
			testUtil.logMsg(format('%s - starting ', step));
			try {
				const user = getUser();
				const Client = require('fabric-base');
				const client = new Client('myclient');
				const channel = client.newChannel('tokenchannel');
				const tlsEnrollment = await getTLS_enrollment(user);
				client.setTlsClientCertAndKey(tlsEnrollment.cert, tlsEnrollment.key);
				const txContext = client.newTransactionContext(user);
				// application must know the discovery peer's connection information
				const peer1_endpoint =  client.newEndpoint({
					url: 'grpcs://localhost:7051',
					pem: getPeer1_pem(),
					'ssl-target-name-override': 'peer0.org1.example.com'
				});

				const proposal = channel.newProposal("example_cc_node");
				const discovery = channel.newChannelDiscovery('mydiscovery');

				try {
					testUtil.logMsg('\n\nDISCOVERY Endorse TEST 1\n');
					// ----- D I S C O V E R Y -----
					await discovery.connect(peer1_endpoint);
					// use the proposal to build the discover request
					discovery.buildRequest(txContext, {proposal: proposal});
					discovery.signRequest(txContext);
					// discovery results will be based on the chaincode of the proposal
					const results = await discovery.discover({request_timeout: 2000, as_localhost: true});
					testUtil.logMsg('\nDiscovery test 1 results :: ' + JSON.stringify(results));

					// ----- E N D O R S E -----
					const build_proposal_request = {fcn: 'move', args: ['a','b','100']};

					proposal.buildProposal(txContext, build_proposal_request);
					proposal.signProposal(txContext);

					const endorsement_handler = discovery.newEndorsementHandler();

					// do not specify 'targets', use a handler instead
					const  endorse_request = {
						handler: endorsement_handler,
						request_timeout: 3000
					}

					const endorse_results = await proposal.endorse(endorse_request);
					if (endorse_results.errors) {
						for (const error of endorse_results.errors) {
							testUtil.logMsg(`Failed to get endorsement : ${error.message}`);
						}
						throw Error('failed endorsement');
					} else {
						for (const response of endorse_results.responses) {
							testUtil.logMsg(`Successfully got an endorsement status: ${response.response.status}`);
						}	
					}
					// lets see what the peers are
					const test_peers = channel.getPeers();
					for (const peer of test_peers) {
						testUtil.logMsg('Discovered peer ' + peer.name);
					}

					// ------ E V E N T -------
					const promises = []
					const channel_event_hubs = await channel.newChannelEventHubsForOrg('Org1MSP');
					for (const channel_event_hub of channel_event_hubs) {
						channel_event_hub.buildStartRequest(txContext);
						channel_event_hub.signStartRequest(txContext);
						const event_listener = new Promise((resolve, reject) => {
							let handle = setTimeout(() => {
								reject(new Error('Test application has timed out waiting for tx event'));
								// may want to close the event hub or unregister the tx event listener
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
								{disconnect: true}
							);
							channel_event_hub.startListening();
						});
						promises.push(event_listener);
					}

					// ------ C O M M I T ------
					proposal.buildCommit(txContext);
					proposal.signCommit(txContext);
					const commit_handler = discovery.newCommitHandler();

					const commit_request = {
						handler: commit_handler,
						request_timeout: 3000
					}

					promises.push(proposal.commit(commit_request));

					// ----- Check results -----
					const commit_event_results =  await Promise.all(promises);
					if (commit_event_results instanceof Error) {
						testUtil.logError('Commit failed :: ' + commit_event_results.stack)
						throw commit_event_results;
					}
					const commit_submission =  commit_event_results.pop();
					if (commit_submission instanceof Error) {
						testUtil.logError('Commit submission failed ' + error.stack);
						throw commit_submission;
					} else if (commit_submission.status) {
						testUtil.logMsg('Commit submitted successfully ' + commit_submission.status)
					} else {
						throw Error('Commit submission failed - no status available');
					}

					for (const event_result of commit_event_results) {
						testUtil.logMsg('Transaction status ' + event_result);
					}

					// ----- Q U E R Y -----
					const build_query_request = {
						fcn: 'query',
						args: 'a'
					};
					proposal.buildQuery(txContext, build_query_request);
					proposal.signQuery(txContext);
					const query_handler = discovery.newQueryHandler();

					const  query_request = {
						handler: query_handler,
						request_timeout: 3000
					}

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
				} catch(error) {
					testUtil.logMsg(format('%s - discovery error: %s', step, error.stack));
				} finally {
					discovery.close();
				}

			} catch(error) {
				testUtil.logError('Test failed ' + step + ' with ::' + error.stack);
				throw Error('Discovery Endorsement FAILED');
			}

			testUtil.logMsg('DISCOVERY ENDORSEMENT TEST COMPLETE');
		}
	);
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
