/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'Client';

const crypto = require('crypto');

const {Utils, BaseClient} = require('fabric-common');
const Chaincode = require('./Chaincode');
const Channel = require('./Channel');
const Orderer = require('./Orderer');
const Peer = require('./Peer');
const TransactionContext = require('./TransactionContext');
const logger = Utils.getLogger(TYPE);

const checkParameter = require('./Utils.js').checkParameter;


/**
 * @classdesc
 * This class represents a Client, the central place
 * for connection and config information.
 * <br><br>
 * see the tutorial {@tutorial proposal}
 * <br><br>
 *
 * @class
 */
const Client = class extends BaseClient {

	/**
	 * Construct a Client object.
	 *	 
	 * @param {string} name - The name of the client.
	 *
	 * @returns {Client} The Client instance.
	 */
	constructor(name = checkParameter('name')) {
		logger.debug('constructor start');
		super();
		this.type = TYPE;

		this.name = name;
		this._tls_mutual = {};
		this._tls_mutual.selfGenerated = false;

		this.channels = new Map();
		this.peers = new Map();
		this.orderers = new Map();
		this.chaincodes = new Map();
	}

	/**
	 * Utility method to merge connection options. The tls mutual and
	 * default connection options from the config will not override any passed
	 * settings of the same name.
	 *
	 * @param {object} options - The object holding the application options
	 * that will be merged on top of this client's options.
	 * @returns {object} - The object holding both the application's options
	 *          and this client's options.
	 */
	getConnectionOptions(options) {
		const method = 'getConnectionOptions';
		logger.debug('%s - start', method);
		let return_options = Object.assign({}, BaseClient.getConfigSetting('connection-options'));
		if (this._tls_mutual.clientCert && this._tls_mutual.clientKey) {
			return_options.clientCert = this._tls_mutual.clientCert;
			return_options.clientKey = this._tls_mutual.clientKey;
		}
		return_options = Object.assign(return_options, options);

		return return_options;
	}

	newTransactionContext(user = checkParameter('user')) {
		return new TransactionContext(user);
	}

	/**
	 * Returns a {@link Chaincode} instance with the given name and versions.
	 * Will always return a new chaincode instance.
	 *
	 * @param {string} name The name of the Chaincode.
	 * @param {string} version The version of the Chaincode.
	 * @returns {Chaincode} The chaincode instance.
	 */
	newChaincode(name = checkParameter('name'), version = checkParameter('version')) {
		const method = 'newChaincode';
		const label = name + '-' + version;
		logger.debug('%s start label:%s', method, label);

		const chaincode = new Chaincode(name, version, this);
		this.chaincodes.set(label, chaincode);
		
		logger.debug('%s return new chaincode name:%s version:%s', method, name, version);
		return chaincode;
	}

	/**
	 * Returns a {@link Chaincode} instance with the given name and versions.
	 * Will return existing chaincode instance or create a new instance
	 * if one does not exist.
	 *
	 * @param {string} name The name of the Chaincode.
	 * @param {string} version The version of the Chaincode.
	 * @returns {Chaincode} The chaincode instance.
	 */
	getChaincode(name = checkParameter('name'), version = checkParameter('version')) {
		const method = 'getChaincode';
		const label = name + '-' + version;
		logger.debug('%s start label:%s', method, label);

		let chaincode = this.chaincodes.get(label);
		if (chaincode) {
			logger.debug('%s return existing chaincode name:%s version:%s', method, name, version);
			return chaincode;
		}
		chaincode = new Chaincode(name, version, this);
		this.chaincodes.set(label, chaincode);
		
		logger.debug('%s return new chaincode name:%s version:%s', method, name, version);
		return chaincode;
	}

	/**
	 * Returns a {@link Peer} instance with the given name.
	 * Will return a new instance. Does not check for existing instances
	 * and does not keep a reference to this instance.
	 *
	 * @param {string} name The name of the peer.
	 * @returns {Peer} The peer instance.
	 */
	newPeer(name = checkParameter('name')) {
		const method = 'newPeer';
		logger.debug('%s start name:%s', method, name);

		const peer = new Peer(name, this);
		
		logger.debug('%s return new peer name:%s', method, name);
		return peer;
	}

	/**
	 * Returns a {@link Peer} instance with the given name.
	 * Will return existing peer instance or create a new instance
	 * if one does not exist.
	 *
	 * @param {string} name The name of the peer.
	 * @returns {Peer} The peer instance.
	 */
	getPeer(name = checkParameter('name')) {
		const method = 'getPeer';
		logger.debug('%s start name:%s', method, name);

		let peer = this.peers.get(name);
		if (peer) {
			logger.debug('%s return existing peer name:%s', method, name);
			return peer;
		}
		peer = new Peer(name, this);
		this.peers.set(name, peer);
		
		logger.debug('%s return new peer name:%s', method, name);
		return peer;
	}

	/**
	 * Returns a {@link Orderer} instance with the given name.
	 * Will return a new instance. Does not check for existing instances
	 * and does not keep a reference to this instance.
	 *
	 * @param {string} name - The name of the Orderer.
	 * @returns {Orderer} The orderer instance.
	 */
	newOrderer(name = checkParameter('name')) {
		const method = 'newOrderer';
		logger.debug('%s start name:%s', method, name);

		const orderer = new Orderer(name, this);
		
		logger.debug('%s return new orderer name:%s', method, name);
		return orderer;
	}

	/**
	 * Returns a {@link Orderer} instance with the given name.
	 * Will return existing orderer instance or create a new instance
	 * if one does not exist.
	 *
	 * @param {string} name - The name of the Orderer.
	 * @returns {Orderer} The orderer instance.
	 */
	getOrderer(name = checkParameter('name')) {
		const method = 'getOrderer';
		logger.debug('%s start name:%s', method, name);

		let orderer = this.orderers.get(name);
		if (orderer) {
			logger.debug('%s return existing orderer name:%s', method, name);
			return orderer;
		}
		orderer = new Orderer(name, this);
		this.orderers.set(name, orderer);
		
		logger.debug('%s return new orderer name:%s', method, name);
		return orderer;
	}

	/**
	 * Returns a {@link Channel} instance with the given name.
	 * Will return a new instance. Does not check for existing instances
	 * and does not keep a reference to this instance.
	 *
	 * @param {string} name The name of the channel.
	 * @returns {Channel} The channel instance.
	 */
	newChannel(name = checkParameter('name')) {
		const method = 'newChannel';
		logger.debug('%s start name:%s', method, name);

		const channel = new Channel(name, this);
		
		logger.debug('%s return new channel name:%s', method, name);
		return channel;
	}

	/**
	 * Returns a {@link Channel} instance with the given name.
	 * Will return an existing channel instance or creates a new instance
	 * if one does not exist.
	 *
	 * @param {string} name The name of the channel.
	 * @returns {Channel} The channel instance.
	 */
	getChannel(name = checkParameter('name')) {
		const method = 'getChannel';
		logger.debug('%s start name:%s', method, name);

		let channel = this.channels.get(name);
		if (channel) {
			logger.debug('%s return existing channel name:%s', method, name);
			return channel;
		}
		channel = new Channel(name, this);
		this.channels.set(name, channel);
		
		logger.debug('%s return new channel name:%s', method, name);
		return channel;
	}

	/**
	 * Sets the mutual TLS client side certificate and key necessary to build
	 * network endpoints when working with a common connection profile (connection profile).
	 * This must be called before a peer, orderer, or channel eventhub is needed.
	 *
	 * If the tls client material has not been provided for the client, it will be
	 * generated if the user has been assigned to this client. Note that it will
	 * always use the default software cryptosuite, not the one assigned to the
	 * client.
	 *
	 * @param {string} clientCert - The pem encoded client certificate.
	 * @param {byte[]} clientKey - The client key.
	 */
	setTlsClientCertAndKey(clientCert, clientKey) {
		const method = 'setTlsClientCertAndKey';
		logger.debug('%s - start', method);
		if (clientCert && clientKey) {
			this._tls_mutual.clientCert = clientCert;
			this._tls_mutual.clientKey = clientKey;
			this._tls_mutual.selfGenerated = false;
		} else {
			logger.debug('%s - generating self-signed TLS client certificate', method);
			// generate X509 cert pair
			// use the default software cryptosuite, not the client assigned cryptosuite, which may be
			// HSM, or the default has been set to HSM. FABN-830
			const key = BaseClient.newCryptoSuite({software: true}).generateEphemeralKey();
			this._tls_mutual.clientKey = key.toBytes();
			this._tls_mutual.clientCert = key.generateX509Certificate('fabric-client');
			this._tls_mutual.selfGenerated = true;
		}
	}

	/**
	 * Utility method to add the mutual tls client material to a set of options.
	 * @param {object} opts - The options object holding the connection settings
	 *  that will be updated with the mutual TLS clientCert and clientKey.
	 * @throws Will throw an error if generating the tls client material fails
	 */
	addTlsClientCertAndKey(opts) {
		// use client cert pair if it exists and is not a self cert generated by this class
		if (!this._tls_mutual.selfGenerated && this._tls_mutual.clientCert && this._tls_mutual.clientKey) {
			opts.clientCert = this._tls_mutual.clientCert;
			opts.clientKey = this._tls_mutual.clientKey;
		}
	}
	
	/**
	 * Get the client certificate hash
	 * @param {boolean} create - Optional. Create the hash based on the current
	 *        user if the client cert has not been assigned to this client
	 * @returns {byte[]} The hash of the client certificate
	 */
	getClientCertHash(create) {
		const method = 'getClientCertHash';
		logger.debug('%s - start', method);
		if (this._tls_mutual.clientCertHash) {
			return this._tls_mutual.clientCertHash;
		}

		if (this._tls_mutual.clientCert) {
			logger.debug('%s - using clientCert %s', method, this._tls_mutual.clientCert);
			const der_cert = Utils.pemToDER(this._tls_mutual.clientCert);
			this._tls_mutual.clientCertHash = computeHash(der_cert);
		} else {
			logger.debug('%s - no tls client cert', method);
		}

		return this._tls_mutual.clientCertHash;
	}

	/**
	 * return a printable representation of this object
	 */
	toString() {
		return 'Client: {' +
			'config: ' + JSON.stringify(config) +
		'}';
	}

};

function computeHash(data) {
	const sha256 = crypto.createHash('sha256');
	return sha256.update(data).digest();
}

module.exports = Client;
