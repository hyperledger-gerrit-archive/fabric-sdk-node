/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const TYPE = 'Client';

const crypto = require('crypto');

const {Utils, BaseClient} = require('fabric-common');
const Channel = require('./Channel');
const Endpoint = require('./Endpoint');
const Orderer = require('./Orderer');
const Peer = require('./Peer');
const Eventer = require('./Eventer');
const Discoverer = require('./Discoverer');
const IdentityContext = require('./IdentityContext');
const logger = Utils.getLogger(TYPE);

const checkParameter = require('./Utils.js').checkParameter;

process.env.GRPC_SSL_CIPHER_SUITES = Utils.getConfigSetting('grpc-ssl-cipher-suites');

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
		logger.debug(`${TYPE}.constructor[${name}] - start `);
		super();
		this.type = TYPE;

		this.name = name;
		this._tls_mutual = {};
		this._tls_mutual.selfGenerated = false;

		this.peers = new Map();
		this.orderers = new Map();
		this.channels = new Map();
	}

	/**
	 * @typedef {Object} ConnectOptions
	 * @property {string} url The orderer URL with format of 'grpc(s)://host:port'.
	 * @property {string} pem - The Peer's TLS certificate, in PEM format,
	 *  to use with the grpcs protocol.
	 * @property {string} [clientKey] - Optional. The client private key, in PEM format,
	 *  to use with the grpcs protocol and mutual TLS. When not provided, the key
	 *  assigned to this client instance will be used.
	 * @property {string} clientCert - The public certificate, in PEM format,
	 *  to use with the grpcs protocol and mutual TLS. When not provided the cert
	 *  assigned to this client instance will be used.
	 * @property {string} ssl-target-name-override - Used in test environment only,
	 *  when the server certificate's hostname (in the 'CN' field) does not match
	 *  the actual host endpoint that the server process runs at, the application
	 *  can work around the client TLS verify failure by setting this property to
	 *  the value of the server certificate's hostname
	 * @property {string} * - include any grpc options. These will be passed to
	 *  the grpc service. A grpc option must have a string key and integer or
	 *  string value.
	 */

	/**
	 * Utility method to merge connection options. The tls mutual and
	 * default connection options from the config will not override any passed
	 * in settings of the same name.
	 *
	 * @param {ConnectOptions} options - The object holding the application options
	 * that will be merged on top of this client's options.
	 * @returns {object} - The object holding both the application's options
	 *  and this client's options.
	 */
	getConnectionOptions(options) {
		const method = `getConnectionOptions: ${this.name}`;
		logger.debug('%s - start', method);
		let return_options = Object.assign({}, BaseClient.getConfigSetting('connection-options'));
		if (this._tls_mutual.clientCert && this._tls_mutual.clientKey) {
			return_options.clientCert = this._tls_mutual.clientCert;
			return_options.clientKey = this._tls_mutual.clientKey;
		}
		return_options = Object.assign(return_options, options);

		return return_options;
	}

	/**
	 * Use this method to build an endpoint options object. This may be reused
	 * when connecting to peers, orderers, and channel event hubs. The input
	 * opts must have an "url" for connecting to a fabric service.
	 * @param {ConnectOptions} opts
	 */
	newEndpoint(opts = {}) {
		const method = `newEndpoint: ${this.name}`;
		logger.debug('%s - start', method);

		const options = this.getConnectionOptions(opts);
		const ssl_target_name_override = options['ssl-target-name-override'];

		if (typeof ssl_target_name_override === 'string') {
			options['grpc.ssl_target_name_override'] = ssl_target_name_override;
			options['grpc.default_authority'] = ssl_target_name_override;
			logger.debug('%s - ssl_target_name_override: %s', method, ssl_target_name_override);
		}
		const endpoint = new Endpoint(options);
		logger.debug('new endpoint url: %s', options.url);

		return endpoint;
	}

	/**
	 * Builds a {@link IdentityContext} instance with the given user.
	 * Will be used when building proposals, commits, and queries.
	 * @param {User} user instance
	 */
	newIdentityContext(user = checkParameter('user')) {
		return new IdentityContext(user, this);
	}

	/**
	 * Returns a {@link Peer} instance with the given name.
	 * Will return a new instance. Does not check for existing instances
	 * and does not keep a reference to this instance.
	 *
	 * @param {string} name - The name of the peer.
	 * @param {string} [mspid] - Optional. The MSP id
	 * @returns {Peer} The peer instance.
	 */
	newPeer(name = checkParameter('name'), mspid) {
		const method = `newPeer: ${this.name}`;
		logger.debug('%s start name:%s', method, name);

		const peer = new Peer(name, this, mspid);

		logger.debug('%s return new peer name:%s', method, name);
		return peer;
	}

	/**
	 * Returns a {@link Peer} instance with the given name.
	 * Will return an existing instance if one exist or it will
	 * create a new instance and save a reference.
	 *
	 * @param {string} name - The name of the peer.
	 * @param {string} [mspid] - Optional. The MSP id
	 * @returns {Peer} The peer instance.
	 */
	getPeer(name = checkParameter('name'), mspid) {
		const method = `getPeer: ${this.name}`;
		logger.debug('%s start name:%s', method, name);

		let peer = this.peers.get(name);
		if (!peer) {
			logger.debug('%s create peer name:%s', method, name);
			peer = new Peer(name, this, mspid);
			this.peers.set(name, peer);
		} else {
			logger.debug('%s existing peer name:%s', method, name);
		}

		logger.debug('%s return peer name:%s', method, name);
		return peer;
	}
	/**
	 * Returns a {@link Orderer} instance with the given name.
	 * Will return a new instance. Does not check for existing instances
	 * and does not keep a reference to this instance.
	 *
	 * @param {string} name - The name of the Orderer.
	 * @param {string} [mspid] - Optional. The MSP id
	 * @returns {Orderer} The orderer instance.
	 */
	newOrderer(name = checkParameter('name'), mspid) {
		const method = `newOrderer: ${this.name}`;
		logger.debug('%s start name:%s', method, name);

		const orderer = new Orderer(name, this, mspid);

		logger.debug('%s return new orderer name:%s', method, name);
		return orderer;
	}

	/**
	 * Returns a {@link Eventer} instance with the given name.
	 * Will return a new instance. Does not check for existing instances
	 * and does not keep a reference to this instance.
	 *
	 * @param {string} name - The name of the Eventer.
	 * @param {string} [mspid] - Optional. The MSP id
	 * @returns {Eventer} The Eventer instance.
	 */
	newEventer(name = checkParameter('name'), mspid) {
		const method = `newEventer: ${this.name}`;
		logger.debug('%s start name:%s', method, name);

		const eventer = new Eventer(name, this, mspid);

		logger.debug('%s return new Eventer name:%s', method, name);
		return eventer;
	}

	/**
	 * Returns a {@link Discoverer} instance with the given name.
	 * Will return a new instance. Does not check for existing instances
	 * and does not keep a reference to this instance.
	 *
	 * @param {string} name - The name of the Discoverer.
	 * @param {string} [mspid] - Optional. The MSP id
	 * @returns {Discoverer} The Discoverer instance.
	 */
	newDiscoverer(name = checkParameter('name'), mspid) {
		const method = `newDiscoverer: ${this.name}`;
		logger.debug('%s start name:%s', method, name);

		const discoverer = new Discoverer(name, this, mspid);

		logger.debug('%s return new Discoverer name:%s', method, name);
		return discoverer;
	}

	/**
	 * Returns a {@link Orderer} instance with the given name.
	 * Will return an existing instance if one exist or it will
	 * create a new instance and save a reference.
	 *
	 * @param {string} name - The name of the orderer.
	 * @param {string} [mspid] - Optional. The MSP id
	 * @returns {Orderer} The orderer instance.
	 */
	getOrderer(name = checkParameter('name'), mspid) {
		const method = `getOrderer: ${this.name}`;
		logger.debug('%s start name:%s', method, name);

		let orderer = this.orderers.get(name);
		if (!orderer) {
			logger.debug('%s create orderer name:%s', method, name);
			orderer = new Orderer(name, this, mspid);
			this.orderers.set(name, orderer);
		} else {
			logger.debug('%s existing orderer name:%s', method, name);
		}

		logger.debug('%s return orderer name:%s', method, name);
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
		const method = `newChannel: ${this.name}`;
		logger.debug('%s start name:%s', method, name);

		const channel = new Channel(name, this);

		logger.debug('%s return new channel name:%s', method, name);
		return channel;
	}

	/**
	 * Returns a {@link Channel} instance with the given name.
	 * Will return an existing instance or create a new one and store
	 * a reference to this instance.
	 *
	 * @param {string} name The name of the channel.
	 * @returns {Channel} The channel instance.
	 */
	getChannel(name = checkParameter('name')) {
		const method = `getChannel: ${this.name}`;
		logger.debug('%s start name:%s', method, name);

		let channel = this.channels.get(name);
		if (!channel) {
			logger.debug('%s create channel name:%s', method, name);
			channel = new Channel(name, this);
			this.channels.set(name, channel);
		} else {
			logger.debug('%s existing channel name:%s', method, name);
		}

		logger.debug('%s return channel name:%s', method, name);
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
		const method = `setTlsClientCertAndKey: ${this.name}`;
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
	 * @returns {byte[]} The hash of the client certificate
	 */
	getClientCertHash() {
		const method = `getClientCertHash: ${this.name}`;
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
		return `Client: {name:${this.name}}`;
	}

};

function computeHash(data) {
	const sha256 = crypto.createHash('sha256');
	return sha256.update(data).digest();
}

module.exports = Client;
