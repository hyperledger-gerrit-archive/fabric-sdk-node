/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */


'use strict';

const grpc = require('fabric-protos/grpc');
const urlParser = require('url');

const {Utils: utils, HashPrimitives} = require('fabric-common');
const logger = utils.getLogger('Remote.js');

// the logger available during construction of instances
const super_logger = utils.getLogger('Remote');

/**
 * The Remote class represents a the base class for all remote nodes (Peer, Orderer).
 *
 * @class
 */
class Remote {

	constructor(name, client) {
		this.name = name;
		this.client = client;
		this.connected = false;
		this.endpoint = null;
	}

	/**
	 * sets up an object with the endpoint configuration settings.
	 *
	 * @param {string} url The orderer URL with format of 'grpc(s)://host:port'.
	 * @param {Object} opts An Object that may contain options to pass to grpcs calls
	 * <br>- pem {string} The certificate file, in PEM format,
	 *    to use with the gRPC protocol (that is, with TransportCredentials).
	 *    Required when using the grpcs protocol.
	 * <br>- clientKey {string} The private key file, in PEM format,
	 *    to use with the gRPC protocol (that is, with TransportCredentials).
	 *    Required when using the grpcs protocol with client certificates.
	 * <br>- clientCert {string} The public certificate file, in PEM format,
	 *    to use with the gRPC protocol (that is, with TransportCredentials).
	 *    Required when using the grpcs protocol with client certificates.
	 * <br>- ssl-target-name-override {string} Used in test environment only, when the server certificate's
	 *    hostname (in the 'CN' field) does not match the actual host endpoint that the server process runs
	 *    at, the application can work around the client TLS verify failure by setting this property to the
	 *    value of the server certificate's hostname
	 * <br>- any other standard grpc call options will be passed to the grpc service calls directly
	 *        grpc options must be an object with string keys and integer or string values
	 */
	setup(opts = {}) {
		this.options = this.client.getConnectionOptions(opts);

		const {url, pem, clientKey, clientCert, ['ssl-target-name-override']: ssl_target_name_override} = this.options;

		if (typeof ssl_target_name_override === 'string') {
			this.options['grpc.ssl_target_name_override'] = ssl_target_name_override;
			this.options['grpc.default_authority'] = ssl_target_name_override;
		}

		// service connection
		this.url = url;
		this.endpoint = new Endpoint(this.url, pem, clientKey, clientCert);

		super_logger.debug(' ** Remote instance url: %s, name: %s, options loaded are:: %j', this.url, this.name, this.options);
	}

	waitForReady(client) {
		const self = this;
		if (!client) {
			throw new Error('Missing required gRPC client');
		}
		const timeout = new Date().getTime() + this.options['grpc-wait-for-ready-timeout'];

		return new Promise((resolve, reject) => {
			client.waitForReady(timeout, (err) => {
				if (err) {
					if (err.message) {
						err.message = err.message + ' name:' + self.name + ' url:' + self.url;
					}
					err.connectFailed = true;
					logger.error(err);

					return reject(err);
				}

				self.connected = true;
				logger.debug('Successfully connected to remote gRPC server');
				resolve();
			});
		});
	}

	/*
	 * Get this remote endpoints characteristics
	 *   It's name, url, and connection options are
	 *   the items that make this instance unique.
	 *   These items may be useful when debugging issues
	 *   or validating responses.
	 */
	getCharacteristics() {
		const characteristics = {};
		characteristics.url = this.url;
		characteristics.name = this.name;
		characteristics.options = this.options;

		return characteristics;
	}

	/**
	 * Determine whether or not this remote endpoint uses TLS.
	 * @returns {boolean} True if this endpoint uses TLS, false otherwise.
	 */
	isTLS() {
		return this.endpoint.isTLS();
	}

}

module.exports = Remote;

/**
 * The Endpoint class represents a remote grpc or grpcs target
 * @class
 */
class Endpoint {
	/**
	 *
	 * @param {string} url
	 * @param {string} pem
	 * @param {string} clientKey
	 * @param {string} clientCert
	 */
	constructor(url, pem, clientKey, clientCert) {

		const purl = urlParser.parse(url, true);
		if (purl.protocol) {
			this.protocol = purl.protocol.toLowerCase().slice(0, -1);
		}
		if (this.protocol === 'grpc') {
			this.addr = purl.host;
			this.creds = grpc.credentials.createInsecure();
		} else if (this.protocol === 'grpcs') {
			if (!(typeof pem === 'string')) {
				throw new Error('PEM encoded certificate is required.');
			}
			const pembuf = Buffer.concat([Buffer.from(pem), Buffer.from('\0')]);
			if (clientKey || clientCert) {
				// must have both clientKey and clientCert if either is defined
				if (clientKey && clientCert) {
					if ((typeof clientKey === 'string') && (typeof clientCert === 'string')) {
						const clientKeyBuf = Buffer.from(clientKey);
						const clientCertBuf = Buffer.concat([Buffer.from(clientCert), Buffer.from('\0')]);
						this.creds = grpc.credentials.createSsl(pembuf, clientKeyBuf, clientCertBuf);
					} else {
						throw new Error('PEM encoded clientKey and clientCert are required.');
					}
				} else {
					throw new Error('clientKey and clientCert are both required.');
				}
			} else {
				this.creds = grpc.credentials.createSsl(pembuf);
			}
			this.addr = purl.host;
		} else {
			const error = new Error();
			error.name = 'InvalidProtocol';
			error.message = 'Invalid protocol: ' + this.protocol + '.  URLs must begin with grpc:// or grpcs://';
			throw error;
		}
	}

	/**
	 * Determine whether or not this endpoint uses TLS.
	 * @returns {boolean} True if this endpoint uses TLS, false otherwise.
	 */
	isTLS() {
		return this.protocol === 'grpcs';
	}

}

module.exports.Endpoint = Endpoint;
