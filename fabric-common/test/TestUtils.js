/**
 * Copyright 2018 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';
const Long = require('long');
const fs = require('fs');
const path = require('path');

const Utils = require('../lib/Utils');
const fabprotos = require('fabric-protos');

module.exports.certificateAsPEM = fs.readFileSync(path.join(__dirname, 'data', 'cert.pem'));
module.exports.keyAsPEM = fs.readFileSync(path.join(__dirname, 'data', 'key.pem'));

module.exports.setCryptoConfigSettings = () => {
	Utils.setConfigSetting('connection-options', {'request-timeout': 3000});
	Utils.setConfigSetting('crypto-hsm', false);
	Utils.setConfigSetting('crypto-suite-software', {'EC': 'fabric-common/lib/impl/CryptoSuite_ECDSA_AES.js'});
	Utils.setConfigSetting('crypto-hash-algo', 'SHA2');
	Utils.setConfigSetting('crypto-keysize', 256);
	Utils.setConfigSetting('key-value-store', 'fabric-common/lib/impl/FileKeyValueStore.js');
};

module.exports.createErrorResponse = (message) => {
	const proposalResponse = module.exports.createProposalResponse(message, 500);

	if (typeof message === 'string') {
		proposalResponse.response.message = Buffer.from(message);
	}

	return proposalResponse;
};

module.exports.createTransactionResponse = (payload) => {
	const proposalResponse = module.exports.createProposalResponse(payload);

	if (payload) {
		proposalResponse.response.payload = payload;
	}

	return proposalResponse;
};

module.exports.createProposalResponse = (results, status = 200) => {
	if (typeof results !== 'string') {
		results = '';
	}
	const extension = new fabprotos.protos.ChaincodeAction();
	extension.response = new fabprotos.protos.Response();
	extension.results = Buffer.from(results);

	const payload = new fabprotos.protos.ProposalResponsePayload();
	payload.extension = extension.toBuffer();

	const identity = new fabprotos.msp.SerializedIdentity();
	identity.setMspid('msp1');

	const endorsement = new fabprotos.protos.Endorsement();
	endorsement.setEndorser(identity.toBuffer());
	endorsement.setSignature(Buffer.from('signature'));

	const response = new fabprotos.protos.Response();
	response.setStatus(status);
	response.setMessage('Dummy message');
	response.setPayload(Buffer.from('response payload'));

	const proposalResponse = new fabprotos.protos.ProposalResponse();
	proposalResponse.setResponse(response);
	proposalResponse.setPayload(payload.toBuffer());
	proposalResponse.setEndorsement(endorsement);

	return proposalResponse;
};

module.exports.createMsp = (name = 'mspid') => {
	const msp = new fabprotos.msp.FabricMSPConfig();
	msp.setName(name);
	msp.setRootCerts(Buffer.from('root_certs'));
	msp.setTlsIntermediateCerts(Buffer.from('tls_intermediate_certs'));

	return msp;
};

module.exports.createEndpoints = (host_base, count) => {
	const endpoints = [];
	for (let index = 1; index < count + 1; index++) {
		const endpoint = new fabprotos.discovery.Endpoint();
		endpoint.setHost(`${host_base}${index}`);
		endpoint.setPort(1000);
		endpoints.push(endpoint);
	}

	return {endpoint: endpoints};
};

module.exports.createSerializedIdentity = (mspid = 'msp1') => {
	const identity = new fabprotos.msp.SerializedIdentity();
	identity.setMspid(mspid);

	return identity.toBuffer();
};

module.exports.createMembership = (endpoint = 'host.com:1000') => {
	const gossip_message = new fabprotos.gossip.GossipMessage();
	const alive_msg = new fabprotos.gossip.AliveMessage();
	const member = new fabprotos.gossip.Member();
	member.setEndpoint(endpoint);
	alive_msg.setMembership(member);
	gossip_message.setAliveMsg(alive_msg);

	return gossip_message.toBuffer();
};

module.exports.createStateInfo = (ledgerHeight = 1000, names = ['chaincode1', 'chaincode2']) => {
	const gossip_message = new fabprotos.gossip.GossipMessage();
	const state_info = new fabprotos.gossip.StateInfo();
	const properties = new fabprotos.gossip.Properties();
	const chaincodes = [];
	for (const name of names) {
		const chaincode = new fabprotos.gossip.Chaincode();
		chaincode.setName(name);
		chaincode.setVersion('v1');
		chaincodes.push(chaincode);
	}
	properties.setChaincodes(chaincodes);
	properties.setLedgerHeight(Long.fromValue(ledgerHeight));
	state_info.setProperties(properties);
	gossip_message.setStateInfo(state_info);

	return gossip_message.toBuffer();
};

module.exports.createChannelHeader = (type = 1, chaincode_name = 'chaincode', channel_name = 'channel', transactionId = 'txid') => {
	const channelHeader = new fabprotos.common.ChannelHeader();
	channelHeader.setType(type); // int32
	channelHeader.setVersion(1); // int32

	channelHeader.setChannelId(channel_name); // string
	channelHeader.setTxId(transactionId.toString()); // string

	const chaincodeID = new fabprotos.protos.ChaincodeID();
	chaincodeID.setName(chaincode_name);

	const headerExt = new fabprotos.protos.ChaincodeHeaderExtension();
	headerExt.setChaincodeId(chaincodeID);

	channelHeader.setExtension(headerExt.toBuffer());
	channelHeader.setTlsCertHash(Buffer.from('cert'));

	return channelHeader;
};

module.exports.createResponsePayload = (results = 'results') => {
	const payload = new fabprotos.protos.ProposalResponsePayload();
	payload.setProposalHash(Buffer.from('proposal'));
	const extension = new fabprotos.protos.ChaincodeAction();
	extension.setResults(Buffer.from(results));
	payload.setExtension(extension.toBuffer());

	return payload.toBuffer();
};

module.exports.TEST_CERT_PEM = '-----BEGIN CERTIFICATE-----' +
'MIIDVDCCAvqgAwIBAgIBATAKBggqhkjOPQQDAjBOMRMwEQYDVQQKDArOoyBBY21l' +
'IENvMRkwFwYDVQQDExB0ZXN0LmV4YW1wbGUuY29tMQ8wDQYDVQQqEwZHb3BoZXIx' +
'CzAJBgNVBAYTAk5MMB4XDTE2MTIxNjIzMTAxM1oXDTE2MTIxNzAxMTAxM1owTjET' +
'MBEGA1UECgwKzqMgQWNtZSBDbzEZMBcGA1UEAxMQdGVzdC5leGFtcGxlLmNvbTEP' +
'MA0GA1UEKhMGR29waGVyMQswCQYDVQQGEwJOTDBZMBMGByqGSM49AgEGCCqGSM49' +
'AwEHA0IABFKnXh7hBdp6s9OJ/aadigT1z2WzBbSc7Hzb3rkaWFz4e+9alqqWg9lr' +
'ur/mDYzG9dudC8jFjVa7KIh+2BxgBayjggHHMIIBwzAOBgNVHQ8BAf8EBAMCAgQw' +
'JgYDVR0lBB8wHQYIKwYBBQUHAwIGCCsGAQUFBwMBBgIqAwYDgQsBMA8GA1UdEwEB' +
'/wQFMAMBAf8wDQYDVR0OBAYEBAECAwQwDwYDVR0jBAgwBoAEAQIDBDBiBggrBgEF' +
'BQcBAQRWMFQwJgYIKwYBBQUHMAGGGmh0dHA6Ly9vY0JDQ1NQLmV4YW1wbGUuY29t' +
'MCoGCCsGAQUFBzAChh5odHRwOi8vY3J0LmV4YW1wbGUuY29tL2NhMS5jcnQwRgYD' +
'VR0RBD8wPYIQdGVzdC5leGFtcGxlLmNvbYERZ29waGVyQGdvbGFuZy5vcmeHBH8A' +
'AAGHECABSGAAACABAAAAAAAAAGgwDwYDVR0gBAgwBjAEBgIqAzAqBgNVHR4EIzAh' +
'oB8wDoIMLmV4YW1wbGUuY29tMA2CC2V4YW1wbGUuY29tMFcGA1UdHwRQME4wJaAj' +
'oCGGH2h0dHA6Ly9jcmwxLmV4YW1wbGUuY29tL2NhMS5jcmwwJaAjoCGGH2h0dHA6' +
'Ly9jcmwyLmV4YW1wbGUuY29tL2NhMS5jcmwwFgYDKgMEBA9leHRyYSBleHRlbnNp' +
'b24wCgYIKoZIzj0EAwIDSAAwRQIgcguBb6FUxO+X8DbY17gpqSGuNC4NT4BddPg1' +
'UWUxIC0CIQDNyHQAwzhw+512meXRwG92GfpzSBssDKLdwlrqiHOu5A==' +
'-----END CERTIFICATE-----';

module.exports.TEST_PRIVATE_KEY_PEM = '-----BEGIN PRIVATE KEY-----' +
'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgZYMvf3w5VkzzsTQY' +
'I8Z8IXuGFZmmfjIX2YSScqCvAkihRANCAAS6BhFgW/q0PzrkwT5RlWTt41VgXLgu' +
'Pv6QKvGsW7SqK6TkcCfxsWoSjy6/r1SzzTMni3J8iQRoJ3roPmoxPLK4' +
'-----END PRIVATE KEY-----';

module.exports.TEST_KEY_PRIVATE_CERT_PEM = '-----BEGIN CERTIFICATE-----' +
'MIICEDCCAbagAwIBAgIUXoY6X7jIpHAAgL267xHEpVr6NSgwCgYIKoZIzj0EAwIw' +
'fzELMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNh' +
'biBGcmFuY2lzY28xHzAdBgNVBAoTFkludGVybmV0IFdpZGdldHMsIEluYy4xDDAK' +
'BgNVBAsTA1dXVzEUMBIGA1UEAxMLZXhhbXBsZS5jb20wHhcNMTcwMTAzMDEyNDAw' +
'WhcNMTgwMTAzMDEyNDAwWjAQMQ4wDAYDVQQDEwVhZG1pbjBZMBMGByqGSM49AgEG' +
'CCqGSM49AwEHA0IABLoGEWBb+rQ/OuTBPlGVZO3jVWBcuC4+/pAq8axbtKorpORw' +
'J/GxahKPLr+vVLPNMyeLcnyJBGgneug+ajE8srijfzB9MA4GA1UdDwEB/wQEAwIF' +
'oDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDAYDVR0TAQH/BAIwADAd' +
'BgNVHQ4EFgQU9BUt7QfgDXx9g6zpzCyJGxXsNM0wHwYDVR0jBBgwFoAUF2dCPaqe' +
'gj/ExR2fW8OZ0bWcSBAwCgYIKoZIzj0EAwIDSAAwRQIgcWQbMzluyZsmvQCvGzPg' +
'f5B7ECxK0kdmXPXIEBiizYACIQD2x39Q4oVwO5uL6m3AVNI98C2LZWa0g2iea8wk' +
'BAHpeA==' +
'-----END CERTIFICATE-----';

module.exports.TEST_PUBLIC_KEY_SKI = 'b5cb4942005c4ecaa9f73a49e1936a58baf549773db213c' +
'f1e22a1db39d9dbef';

module.exports.TEST_PRIVATE_KEY_SKI = '0e67f7fa577fd76e487ea3b660e1a3ff15320dbc95e396' +
'd8b0ff616c87f8c81a';

module.exports.TEST_MSG = 'this is a test message';
module.exports.TEST_LONG_MSG = 'The Hyperledger project is an open source collaborative effort created to advance cross-industry blockchain technologies. ' +
	'It is a global collaboration including leaders in finance, banking, Internet of Things, supply chains, manufacturing and Technology. The Linux ' +
	'Foundation hosts Hyperledger as a Collaborative Project under the foundation. Why Create the Project? Not since the Web itself has a technology ' +
	'promised broader and more fundamental revolution than blockchain technology. A blockchain is a peer-to-peer distributed ledger forged by consensus, ' +
	'combined with a system for “smart contracts” and other assistive technologies. Together these can be used to build a new generation of transactional ' +
	'applications that establishes trust, accountability and transparency at their core, while streamlining business processes and legal constraints. ' +
	'Think of it as an operating system for marketplaces, data-sharing networks, micro-currencies, and decentralized digital communities. It has the potential ' +
	'to vastly reduce the cost and complexity of getting things done in the real world. Only an Open Source, collaborative software development approach can ' +
	'ensure the transparency, longevity, interoperability and support required to bring blockchain technologies forward to mainstream commercial adoption. That ' +
	'is what Hyperledger is about – communities of software developers building blockchain frameworks and platforms.';

module.exports.HASH_MSG_SHA2_256 = '4e4aa09b6d80efbd684e80f54a70c1d8605625c3380f4cb012b32644a002b5be';
module.exports.HASH_LONG_MSG_SHA2_256 = '0d98987f5e4e3ea611f0e3d768c594ff9aac25404265d73554d12c86d7f6fbbc';
module.exports.HASH_MSG_SHA2_384 = '6247065855a812ecd182476576c02d46a675845ef4b0056e973ca42dcf8191d3adabc8c6c4b909f20f96136032ab723a';
module.exports.HASH_MSG_SHA3_256 = '7daeff454f7e91e3cd2d1c1bd5fcd1b6c9d4d5fffc6c327710d8fae7b06ee4a3';
module.exports.HASH_LONG_MSG_SHA3_256 = '577174210438a85ae4311a62e5fccf2441b960013f5691993cdf38ed6ba0c84f';
module.exports.HASH_MSG_SHA3_384 = '9e9c2e5edf6cbc0b512807a8efa2917daff71b83e04dee28fcc00b1a1dd935fb5afc5eafa06bf55bd64792a597e2a8f3';
module.exports.HASH_LONG_MSG_SHA3_384 = '47a90d6721523682e09b81da0a60e6ee1faf839f0503252316638daf038cf682c0a842edaf310eb0f480a2e181a07af0';

// specifically set the values to defaults because they may have been overridden when
// running in the overall test bucket ('gulp test')
module.exports.resetDefaults = function() {
	global.hfc.config = undefined;
	require('nconf').reset();
};
