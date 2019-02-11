/**
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const Client = require('fabric-client');
const User = Client.User;
const FabricCAServices = require('fabric-ca-client');

const childProcess = require('child_process');
const stripAnsi = require('strip-ansi');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

// High level constants for timeouts
const TIMEOUTS = {
	LONG_STEP : 240 * 1000,
	MED_STEP : 120 * 1000,
	SHORT_STEP: 60 * 1000,
	LONG_INC : 30 * 1000,
	MED_INC : 10 * 1000,
	SHORT_INC: 5 * 1000
};

// all temporary files and directories are created under here
const tempdir = path.join(os.tmpdir(), 'hfc');

// directory for file based KeyValueStore
module.exports.KVS = path.join(tempdir, 'hfc-test-kvs');
function storePathForOrg(org) {
	return module.exports.KVS + '_' + org;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run a shell command
 * @param {Boolean} pass - Boolean pass/fail case expected, undefined if unchecked case
 * @param {DataTable} cmd -  CLI command with parameters to be run
 * @return {Promise} - Promise that will be resolved or rejected with an error
 */
function runShellCommand(pass, cmd) {
	if (typeof cmd !== 'string') {
		return Promise.reject('Command passed to function was not a string');
	} else {
		const command = cmd.replace(/\s*[\n\r]+\s*/g, ' ');
		let stdout = '';
		let stderr = '';
		const env = Object.create(process.env);

		return new Promise((resolve, reject) => {

			const options = {
				env : env,
				maxBuffer: 100000000
			};
			const childCliProcess = childProcess.exec(command, options);

			childCliProcess.stdout.setEncoding('utf8');
			childCliProcess.stderr.setEncoding('utf8');

			childCliProcess.stdout.on('data', (data) => {
				data = stripAnsi(data);
				logMsg('STDOUT: ', data);
				stdout += data;
			});

			childCliProcess.stderr.on('data', (data) => {
				data = stripAnsi(data);
				logMsg('STDERR: ', data);
				stderr += data;
			});

			childCliProcess.on('error', (error) => {
				this.lastResp = {error : error, stdout : stdout, stderr : stderr};
				if (pass) {
					reject(this.lastResp);
				}
			});

			childCliProcess.on('close', (code) => {
				if (pass === undefined) {
					// don't care case
					this.lastResp = {code : code, stdout : stdout, stderr : stderr};
					resolve(this.lastResp);
				} else if (code && code !== 0 && pass) {
					// non zero return code, should pass
					this.lastResp = {code : code, stdout : stdout, stderr : stderr};
					reject(this.lastResp);
				} else if (code && code === 0 && !pass) {
					// zero return code, should fail
					this.lastResp = {code : code, stdout : stdout, stderr : stderr};
					reject(this.lastResp);
				} else {
					this.lastResp = {code : code, stdout : stdout, stderr : stderr};
					resolve(this.lastResp);
				}
			});
		});
	}
}

/**
 * Retrieve an enrolled user, or enroll the user if necessary.
 * @param {string} username The name of the user.
 * @param {string} password The enrollment secret necessary to enroll the user.
 * @param {Client} client The Fabric client object.
 * @param {string} userOrg The name of the user's organization.
 * @param {CommonConnectionProfile} ccp the common connection profile
 * @return {Promise<User>} The retrieved and enrolled user object.
 */
async function getMember(username, password, client, userOrg, ccp) {

	const org = ccp.getOrganization(userOrg);
	if (!org) {
		throw new Error('Could not find ' + userOrg + ' in configuration');
	}

	const caUrl = org.ca.url;

	const user = await client.getUserContext(username, true);

	try {
		if (user && user.isEnrolled()) {
			return user;
		}

		const member = new User(username);
		let cryptoSuite = client.getCryptoSuite();
		if (!cryptoSuite) {
			cryptoSuite = Client.newCryptoSuite();
			if (userOrg) {
				cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: module.exports.storePathForOrg(org.name)}));
				client.setCryptoSuite(cryptoSuite);
			}
		}
		member.setCryptoSuite(cryptoSuite);

		// need to enroll it with CA server
		const tlsOptions = {
			trustedRoots: [],
			verify: false
		};
		const cop = new FabricCAServices(caUrl, tlsOptions, org.ca.name, cryptoSuite);

		const enrollment = await cop.enroll({enrollmentID: username, enrollmentSecret: password});

		await member.setEnrollment(enrollment.key, enrollment.certificate, org.mspid);

		let skipPersistence = false;
		if (!client.getStateStore()) {
			skipPersistence = true;
		}
		await client.setUserContext(member, skipPersistence);
		return member;
	} catch (err) {
		logError('Failed to enroll and persist user. Error: ' + (err.stack ? err.stack : err));
		return Promise.reject(err);
	}
}

/**
 * Retrieve the admin identity for the given organization.
 * @param {Client} client The Fabric client object.
 * @param {string} userOrg The name of the user's organization.
 * @param {CommonConnectionProfile} ccp the common connection profile
 * @return {User} The admin user identity.
 */
function getOrgAdmin(client, userOrg, ccp) {
	try {

		const org = ccp.getOrganization(userOrg);
		if (!org) {
			throw new Error('Could not find ' + userOrg + ' in configuration');
		}

		const keyPEM = fs.readFileSync(org.adminPrivateKeyPEM.path);
		const certPEM = fs.readFileSync(org.signedCertPEM.path);

		const cryptoSuite = Client.newCryptoSuite();
		cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: module.exports.storePathForOrg(userOrg)}));
		client.setCryptoSuite(cryptoSuite);

		return Promise.resolve(client.createUser({
			username: 'peer' + userOrg + 'Admin',
			mspid: org.mspid,
			cryptoContent: {
				privateKeyPEM: keyPEM.toString(),
				signedCertPEM: certPEM.toString()
			}
		}));
	} catch (err) {
		return Promise.reject(err);
	}
}

/**
 * Retrieve the admin identity of the orderer service organization.
 * @param {Client} client The Fabric client object.
 * @param {CommonConnectionProfile} ccp the common connection profile
 * @return {User} The retrieved orderer admin identity.
 */
function getOrdererAdmin(client, ordererName, ccp) {
	try {
		const orderer = ccp.getOrderer(ordererName);
		const keyPEM = fs.readFileSync(orderer.adminPrivateKeyPEM.path);
		const certPEM = fs.readFileSync(orderer.signedCertPEM.path);

		return Promise.resolve(client.createUser({
			username: 'ordererAdmin',
			mspid: orderer.mspid,
			cryptoContent: {
				privateKeyPEM: keyPEM.toString(),
				signedCertPEM: certPEM.toString()
			}
		}));
	} catch (err) {
		return Promise.reject(err);
	}
}

function getSubmitter(client, peerAdmin, org, ccp) {
	if (peerAdmin) {
		return getOrgAdmin(client, org, ccp);
	} else {
		return getMember('admin', 'adminpw', client, org, ccp);
	}
}

/**
 * Enrol and get the cert
 * @param {*} fabricCAEndpoint url of org endpoint
 * @param {*} caName name of caName
 * @return {Object} something useful in a promise
 */
async function tlsEnroll(fabricCAEndpoint, caName) {
	const tlsOptions = {
		trustedRoots: [],
		verify: false
	};
	const caService = new FabricCAServices(fabricCAEndpoint, tlsOptions, caName);
	const req = {
		enrollmentID: 'admin',
		enrollmentSecret: 'adminpw',
		profile: 'tls'
	};

	const enrollment = await caService.enroll(req);
	enrollment.key = enrollment.key.toBytes();
	return enrollment;
}


function logMsg(msg, obj) {
	if (obj) {
		// eslint-disable-next-line no-console
		console.log(msg, obj);
	} else {
		// eslint-disable-next-line no-console
		console.log(msg);
	}
}

function logError(msg, obj) {
	if (obj) {
		// eslint-disable-next-line no-console
		console.error(msg, obj);
	} else {
		// eslint-disable-next-line no-console
		console.error(msg);
	}
}

async function getClientForOrg(network_ccp, org_ccp) {
	// build a 'Client' instance that knows of a network
	//  this network config does not have the client information, we will
	//  load that later so that we can switch this client to be in a different
	//  organization
	const client = Client.loadFromConfig(network_ccp);

	// load the client information for this organization
	// this file only has the client section
	client.loadFromConfig(org_ccp);

	// tell this client instance where the state and key stores are located
	await client.initCredentialStores();

	// get the CA associated with this client's organization
	// ---- this must only be run after the client has been loaded with a
	// client section of the connection profile
	const caService = client.getCertificateAuthority();

	const request = {
		enrollmentID: 'admin',
		enrollmentSecret: 'adminpw',
		profile: 'tls'
	};
	const enrollment = await caService.enroll(request);

	const key = enrollment.key.toBytes();
	const cert = enrollment.certificate;

	// set the material on the client to be used when building endpoints for the user
	client.setTlsClientCertAndKey(cert, key);

	return client;
}

async function createUpdateChannel(create, file, channel_name, client_org1, client_org2, orderer_org1, orderer_org2) {
	// get the config envelope created by the configtx tool
	const envelope_bytes = fs.readFileSync(file);
	// Have the sdk get the config update object from the envelope.
	// the config update object is what is required to be signed by all
	// participating organizations
	const config = client_org1.extractChannelConfig(envelope_bytes);

	const signatures = [];
	// sign the config by the  admins
	const signature1 = client_org1.signChannelConfig(config);
	signatures.push(signature1);
	const signature2 = client_org2.signChannelConfig(config);
	signatures.push(signature2);
	// now we have enough signatures...

	// get an admin based transaction
	const tx_id = client_org1.newTransactionID(true);

	const request = {
		config: config,
		signatures : signatures,
		name : channel_name,
		orderer : orderer_org1,
		txId  : tx_id
	};

	let results = null;
	let text = 'create';
	if (create) {
		results = await client_org1.createChannel(request);
	} else {
		text = 'update';
		results = await client_org1.updateChannel(request);
	}
	if (results.status === 'SUCCESS') {
		await sleep(5000);
	} else {
		throw new Error('Failed to ' + text + ' the channel. ');
	}
}

async function joinChannel(channel_name, peer, orderer, client) {
	const channel = client.newChannel(channel_name);

	// get an admin based transaction
	let tx_id = client.newTransactionID(true);

	let request = {
		orderer: orderer,
		txId : 	tx_id
	};

	const genesis_block = await channel.getGenesisBlock(request);

	tx_id = client.newTransactionID(true);
	request = {
		targets: [peer],
		block : genesis_block,
		txId : 	tx_id
	};

	const join_results = await channel.joinChannel(request, 30000);
	if (join_results && join_results[0] && join_results[0].response && join_results[0].response.status === 200) {
		sleep(10000); // let the peer catch up
	} else {
		throw new Error('Failed to join channel on org');
	}

	return channel;
}

module.exports.TIMEOUTS = TIMEOUTS;
module.exports.storePathForOrg = storePathForOrg;
module.exports.sleep = sleep;
module.exports.runShellCommand = runShellCommand;
module.exports.getOrdererAdmin = getOrdererAdmin;
module.exports.getSubmitter = getSubmitter;
module.exports.tlsEnroll = tlsEnroll;
module.exports.logMsg = logMsg;
module.exports.logError = logError;
module.exports.getClientForOrg = getClientForOrg;
module.exports.createUpdateChannel = createUpdateChannel;
module.exports.joinChannel = joinChannel;

