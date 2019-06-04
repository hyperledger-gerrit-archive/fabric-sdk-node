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
	to build, sign, and send proposals to peers to be endorsed with new flow based
	on a new object "Proposal". The new flow offers some new advantages
	   -- uses a new object "TransactionContext" that replaces the "TransactionID".
		  This new object contains the transaction ID, the nonce, and a "User".
		  The context is passed each time a proposal is built. This allows the
		  application to control each transactions without having to change the
		  client object. The context is reusable, it will recalculate a new
		  transaction ID and nonce each time a proposal is built. The application
		  may then get the transactionId from the context after calling the
		  buildAndSign* or the build methods.
	   -- stores 
	*/
	this.Then(/^I use only base to call (.+?) on (.+?) of chaincode (.+?) as organization (.+?) on channel (.+?) with args (.+?)$/,
		{timeout: testUtil.TIMEOUTS.LONG_STEP},
		async (cc_fcn, chaincode_version, chaincode_name, org_name, channel_name, args) => {
			const step = 'NodeSDK-Base Endorsement';
			testUtil.logMsg(format('%s - starting for %s, %s, %s', step, chaincode_name, org_name, channel_name));

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
			const txContext = client.getTransactionContext(user);

			// The chaincode object will be used to keep related information about the
			// chaincode... right now with an endorsement flow it is just the name, but it could
			// be used to store discovery endorsement and related collection plans.
			const chaincode = client.getChaincode(chaincode_name, chaincode_version);

			// The channel object will be used to represent the peers and orderers
			// and channel event hubs, the fabric network of the channel. Will be used
			// to build any channel related protos (channel header). Will be the focal
			// point for endorsements and queries on the channel. The channel object
			// must be built by the client so that any peer or orderer object created
			// by the discovery action on the channel will be able to get the connection
			// information.
			const channel = client.getChannel(channel_name);

			// The peers and orderers will be built by the client so that common
			// connection information will come from the client object.
			const peer1 = client.getPeer('peer1');
			// unique connection information will be provided on the connect()
			const peer1_connect_options = {
				url: 'grpcs://localhost:7051',
				pem: getPeer1_pem(),
				'ssl-target-name-override': 'peer0.org1.example.com'
			};

			// new call with NodeSDK-Base, the connect will take the unique
			// to this endpoint settings, like URL and TLS cert of endpoint,
			// (the client side certs will come from the client object which
			//   which this object has a reference).
			// The connect call will setup a connection to the endpoint.
			await peer1.connect(peer1_connect_options);

			// build another peer
			const peer2 = client.getPeer('peer2');
			const peer2_connect_options = {
				url: 'grpcs://localhost:8051',
				pem: getPeer2_pem(),
				'ssl-target-name-override': 'peer0.org2.example.com'
			};
			await peer2.connect(peer2_connect_options);

			// This is a new object to NodeSDK-Base. This "Proposal" object will
			// centralize the endorsement operation, including the proposal results.
			// Proposals must be built from channel and chaincode objects
			const proposal = channel.newProposal(chaincode);
			
			// proposal will have to know all the values needed by the chaincode
			// to perform the endorsement (invoke)
			proposal.setFunctionName(cc_fcn);
			proposal.setFunctionArguments(eval(args));
			
			// The proposal object has the building of the request, the signing
			// and the sending steps broken out into separate API's that must
			// be called individually.
			
			// The following calls will be used when signing externally
			// --- the user within the txContext does not have to have the
			//     signing identity, meaning that user object does not have
			//     access to the private key.
			const proposal_bytes = proposal.buildUnsignedProposal(txContext);
			// the signing would not be done this way, it would be done by
			// some process external to the application, for example on
			// the browser and then be assigned to the proposal object with
			// the setProposalSignature method
			const p_signature = proposal.signProposal(txContext, proposal_bytes);
			// once the proposal has been built and signed, it is ready
			// to be sent to the peers to be endorsed
			proposal.setProposalSignature(p_signature);
			
			// The following is a single call that will build and sign the
			// proposal. Once this completes the proposal object is ready
			// to be sent to the peers to be endorsed.
			proposal.buildAndSignProposal(txContext);

			// Now that the proposal is all built and signed, it is ready
			// to be sent to the endorsing peers.
			// First decide on the peers and a request timeout
			const  endorse_request = {
				targets: [peer1, peer2], // could also use the peer names
										 // if peers have been added to the
										 // channel
				request_timeout: 3000 // optional, but nice to be able to 
									  // control the timeout when you know
									  // the request is going to take longer
									  // than normal
			}
			
			// ----- E N D O R S E -----
			// New API, the "endorse" method on the proposal object
			// will send the signed proposal to the requested peers.
			await proposal.endorse(endorse_request);

			// create an orderer object that will have a reference
			// to the client object to supply connection information
			const orderer = client.getOrderer('orderer');
			const order_connect_options = {
				url: 'grpcs://localhost:7050',
				pem: getOrderer_pem(),
				'ssl-target-name-override': 'orderer.example.com'
			};

			// new API to have the orderer object connect with the
			// fabric endpoint that it represents.
			await orderer.connect(order_connect_options)

			// The proposal object has each of the steps broken out
			// into API's that may be called individually when signing
			// externally
			// --- the user within the txContext does not have to have the
			//     signing identity, meaning that user object does not have
			//     access to the private key.
			const unsigned_commit_bytes = proposal.buildUnsignedCommit(txContext);
			// this part would be done external to the application, for example within
			// the browser and then sent back here to be used
			const signature_bytes = proposal.signCommit(txContext, unsigned_commit_bytes);
			proposal.setCommitSignature(signature_bytes);
			// -- or -- this will build the unsigned and then sign and then save to be
			// ready to be sent to the orderer
			proposal.buildAndSignCommit(txContext);

			const commit_request = {
				targets: [orderer], // could also use the orderer names
				request_timeout: 3000
			}

			// ----- C O M M I T -----
			// New API to send the endorsed proposal to the orderer to be committed.
			const results = await proposal.commit(commit_request);
			testUtil.logMsg(format('%s - commit results %s', step, results.status));

			// ALL DONE
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
