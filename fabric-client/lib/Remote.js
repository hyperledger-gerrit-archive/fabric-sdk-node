/*
 Copyright 2016 IBM All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the 'License');
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

		http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an 'AS IS' BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

'use strict';

var grpc = require('grpc');
var urlParser = require('url');

var utils = require('./utils.js');
var logger = utils.getLogger('Remote.js');


/**
 * The Remote class represents a the base class for all remote nodes, Peer, Orderer , and MemberServicespeer.
 *
 * @class
 */
var Remote = class {

	/**
	 * Constructs a Node with the endpoint configuration settings.
	 *
	 * @param {string} url The orderer URL with format of 'grpcs://host:port'.
	 * @param {opts} An Object that may contain options to override the global settings
	 *    pem The certificate file, in PEM format,
	 *       to use with the gRPC protocol (that is, with TransportCredentials).
	 *       Required when using the grpcs protocol.
	 */
	constructor(url, opts) {
		var pem = null;
		if(opts) {
			if(opts.pem) {
				pem = opts.pem;
			}
		}

		var ssl_target_name_override = 'localhost';
		var default_authority = 'localhost';
		if(opts && opts['ssl-target-name-override']) {
			ssl_target_name_override = opts['ssl-target-name-override'];
		}
		else {
			ssl_target_name_override = utils.getConfigSetting('ssl-target-name-override','localhost');
		}
		if(opts && opts['default-authority']) {
			default_authority = opts['default-authority'];
		}
		else {
			default_authority = utils.getConfigSetting('default-authority','localhost');
		}

		// connection options
		this._options = {
			secureProtocol: 'TLSv1_2_server_method'
		};
		if(ssl_target_name_override) this._options['grpc.ssl_target_name_override'] = ssl_target_name_override;
		if(default_authority) this._options['grpc.default_authority'] = default_authority;

		// service connection
		this._url = url;
		this._endpoint = new Endpoint(url, pem);
	}

	/**
	 * Get the URL of the orderer.
	 * @returns {string} Get the URL associated with the Orderer.
	 */
	getUrl() {
		logger.debug('Remote.getUrl::'+this._url);
		return this._url;
	}

	/**
	* return a printable representation of this object
	*/
	toString() {
		return ' Remote : {' +
			'url:' + this._url +
		'}';
	}
};

module.exports = Remote;

//
// The Endpoint class represents a remote grpc or grpcs target
//
var Endpoint = class {
	constructor(url /*string*/ , pem /*string*/ ) {
		var fs = require('fs'),
			path = require('path');

		var cert = fs.readFileSync('/Users/jimzhang/workspace/fabric-sdk-node/test/fixtures/config/tls/Org1-server2-cert.pem');
		var key = fs.readFileSync('/Users/jimzhang/workspace/fabric-sdk-node/test/fixtures/config/tls/Org1-server2-key.pem');

		var purl = urlParser.parse(url, true);
		var protocol;
		if (purl.protocol) {
			protocol = purl.protocol.toLowerCase().slice(0, -1);
		}
		if (protocol === 'grpc') {
			this.addr = purl.host;
			this.creds = grpc.credentials.createInsecure();
		} else if (protocol === 'grpcs') {
			if(!(typeof pem === 'string')) {
				throw new Error('PEM encoded certificate is required.');
			}
			this.addr = purl.host;
			this.creds = grpc.credentials.createSsl(new Buffer(pem));
		} else {
			var error = new Error();
			error.name = 'InvalidProtocol';
			error.message = 'Invalid protocol: ' + protocol + '.  URLs must begin with grpc:// or grpcs://';
			throw error;
		}
	}
};

module.exports.Endpoint = Endpoint;
