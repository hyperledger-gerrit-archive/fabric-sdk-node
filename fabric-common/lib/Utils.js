/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */


'use strict';

const util = require('util');
const winston = require('winston');
const crypto = require('crypto');
const path = require('path');
const os = require('os');

const Config = require('./Config');
const KeyValueStore = require('./KeyValueStore');
const sjcl = require('sjcl');
const yn = require('yn');

//
// The following methods are for loading the proper implementation of an extensible APIs.
//

/**
 * Returns a new instance of the CryptoSuite API implementation. Supports the following:
 * - newCryptoSuite({software: true, keysize: 256, algorithm: EC})
 * - newCryptoSuite({software: false, lib: '/usr/local/bin/pkcs11.so', slot: 0, pin: '1234'})
 * - newCryptoSuite({keysize: 384})
 * - newCryptoSuite()
 * @param {Object} setting This optional parameter is an object with the following optional properties:
 *    - software {boolean}: Whether to load a software-based implementation (true) or HSM implementation (false)
 *        default is true (for software based implementation), specific implementation module is specified
 *        in the setting 'crypto-suite-software'
 *  - keysize {number}: The key size to use for the crypto suite instance. default is value of the setting 'crypto-keysize'
 *  - algorithm {string}: Digital signature algorithm, currently supporting ECDSA only with value "EC"
 *  - hash {string}: 'SHA2' or 'SHA3'
 */
module.exports.newCryptoSuite = (setting) => {
	let csImpl, keysize, algorithm, hashAlgo, opts = null;

	let useHSM = false;
	if (setting && typeof setting.software === 'boolean') {
		useHSM = !setting.software;
	} else {
		useHSM = yn(getConfigSetting('crypto-hsm'));
	}

	csImpl = useHSM ? getConfigSetting('crypto-suite-hsm') : getConfigSetting('crypto-suite-software');

	// step 1: what's the cryptosuite impl to use, key size and algo
	if (setting && setting.keysize && typeof setting === 'object' && typeof setting.keysize === 'number') {
		keysize = setting.keysize;
	} else {
		keysize = getConfigSetting('crypto-keysize');
	}

	if (setting && setting.algorithm && typeof setting === 'object' && typeof setting.algorithm === 'string') {
		algorithm = setting.algorithm.toUpperCase();
	} else {
		algorithm = 'EC';
	}

	if (setting && setting.hash && typeof setting === 'object' && typeof setting.hash === 'string') {
		hashAlgo = setting.hash.toUpperCase();
	} else {
		hashAlgo = null;
	}

	// csImpl at this point should be a map (see config/default.json) with keys being the algorithm
	csImpl = csImpl[algorithm];

	if (!csImpl) {
		throw new Error(util.format('Desired CryptoSuite module not found supporting algorithm "%s"', algorithm));
	}

	const cryptoSuite = require(csImpl);

	// the 'opts' argument to be passed or none at all
	opts = (typeof setting === 'undefined') ? null : setting;

	// opts Option is the form { lib: string, slot: number, pin: string }
	return new cryptoSuite(keysize, hashAlgo, opts);
};

// Provide a keyValueStore for couchdb, etc.
module.exports.newKeyValueStore = async (options) => {
	// initialize the correct KeyValueStore
	const kvsEnv = getConfigSetting('key-value-store');
	const Store = require(kvsEnv);
	const store = new Store(options);
	await store.initialize();
	return store;
};

const LOGGING_LEVELS = ['debug', 'info', 'warn', 'error'];

//
// Internal API.
// Notice this API is only used at the SDK scope. For the client application, do not use
// this api.
//
// Get the standard logger to use throughout the SDK code. If the client application has
// configured a logger, then that'll be returned.
//
// The user can also make user of the built-in "winston" based logger and use the environment
// variable HFC_LOGGING to pass in configurations in the following format:
//
// {
//   'error': 'error.log',				// 'error' logs are printed to file 'error.log' relative of the current working dir for node.js
//   'debug': '/tmp/myapp/debug.log',	// 'debug' and anything more critical ('info', 'warn', 'error') can also be an absolute path
//   'info': 'console'					// 'console' is a keyword for logging to console
// }
//
module.exports.getLogger = function (name) {
	const saveLogger = function (logger) {
		if (global.hfc) {
			global.hfc.logger = logger;
		} else {
			global.hfc = {
				logger: logger
			};
		}
	};

	const newDefaultLogger = () => {
		return new winston.Logger({
			transports: [
				new (winston.transports.Console)({colorize: true, timestamp: true})
			]
		});
	};

	const insertLoggerName = (originalLogger, lname) => {
		const logger = Object.assign({}, originalLogger);

		LOGGING_LEVELS.forEach((method) => {
			const func = originalLogger[method];

			logger[method] = (function (context, loggerName, f) {
				return function () {
					if (arguments.length > 0) {
						arguments[0] = '[' + loggerName + ']: ' + arguments[0];
					}

					f.apply(context, arguments);
				};
			})(originalLogger, lname, func);
		});

		return logger;
	};

	if (global.hfc && global.hfc.logger) {
		return insertLoggerName(global.hfc.logger, name);
	}

	// see if the config has it set
	const config_log_setting = getConfigSetting('hfc-logging', undefined); // environment setting will be HFC_LOGGING

	const options = {};
	if (config_log_setting) {
		try {
			const config = typeof config_log_setting === 'string' ? JSON.parse(config_log_setting) : config_log_setting;
			if (typeof config !== 'object') {
				throw new Error('Environment variable "HFC_LOGGING" must be an object conforming to the format documented.');
			}
			for (const level in config) {
				if (!config.hasOwnProperty(level)) {
					continue;
				}

				if (LOGGING_LEVELS.includes(level)) {
					if (!options.transports) {
						options.transports = [];
					}

					if (config[level] === 'console') {
						options.transports.push(new (winston.transports.Console)({
							name: level + 'console',
							level: level,
							timestamp: true,
							colorize: true
						}));
					} else {
						options.transports.push(new (winston.transports.File)({
							name: level + 'file',
							level: level,
							filename: config[level],
							timestamp: true,
							colorize: false,
							json: false
						}));
					}
				}
			}

			const logger = new winston.Logger(options);
			logger.debug('Successfully constructed a winston logger with configurations', config);
			saveLogger(logger);
			return insertLoggerName(logger, name);
		} catch (err) {
			// the user's configuration from environment variable failed to parse.
			// construct the default logger, log a warning and return it
			const logger = newDefaultLogger();
			saveLogger(logger);
			logger.log('warn', 'Failed to parse environment variable "HFC_LOGGING". Returned a winston logger with default configurations. Error: %s', err.stack ? err.stack : err);
			return insertLoggerName(logger, name);
		}
	}

	const logger = newDefaultLogger();
	saveLogger(logger);
	logger.debug('Returning a new winston logger with default configurations');
	return insertLoggerName(logger, name);
};

//
// Internal method to add additional configuration file to override default file configuration settings
//
module.exports.addConfigFile = (filePath) => {
	const config = exports.getConfig();
	config.file(filePath);
};

//
// Internal method to set an override setting to the configuration settings
//
module.exports.setConfigSetting = (name, value) => {
	const config = exports.getConfig();
	config.set(name, value);
};

//
// Internal method to get an override setting to the configuration settings
//
const getConfigSetting = (name, default_value) => {
	const config = exports.getConfig();
	return config.get(name, default_value);
};
exports.getConfigSetting = getConfigSetting;
//
// Internal method to get the configuration settings singleton
//
exports.getConfig = () => {
	if (global.hfc && global.hfc.config) {
		return global.hfc.config;
	}
	const config = new Config();
	if (global.hfc) {
		global.hfc.config = config;
	} else {
		global.hfc = {config: config};
	}

	return config;
};

//
// Other miscellaneous methods
//

/**
 * Convert from a bitArray to bytes (refer to SJCL's codec)
 * @param {number[]} arr a bitArray to convert from
 * @returns the bytes converted from the bitArray
 */
module.exports.bitsToBytes = (arr) => {
	const out = [];
	const bl = sjcl.bitArray.bitLength(arr);
	let tmp;
	for (let i = 0; i < bl / 8; i++) {
		if ((i & 3) === 0) {
			tmp = arr[i / 4];
		}
		out.push(tmp >>> 24);
		tmp <<= 8;
	}
	return out;
};

/**
 * Convert from bytes to a bitArray (refer to SJCL's codec)
 * @param {number[]} bytes a bytes to convert from
 * @returns the bitArray converted from bytes
 */
module.exports.bytesToBits = (bytes) => {
	const out = [];
	let i;
	let tmp = 0;
	for (i = 0; i < bytes.length; i++) {
		tmp = tmp << 8 | bytes[i];
		if ((i & 3) === 3) {
			out.push(tmp);
			tmp = 0;
		}
	}
	if (i & 3) {
		out.push(sjcl.bitArray.partial(8 * (i & 3), tmp));
	}
	return out;
};

module.exports.zeroBuffer = (length) => {
	return Buffer.alloc(length);
};

// utility function to convert Node buffers to Javascript arraybuffer
module.exports.toArrayBuffer = (buffer) => {
	const ab = new ArrayBuffer(buffer.length);
	const view = new Uint8Array(ab);
	for (let i = 0; i < buffer.length; ++i) {
		view[i] = buffer[i];
	}
	return ab;
};

// utility function to create a random number of
// the specified length.
module.exports.getNonce = (length) => {
	if (length) {
		if (Number.isInteger(length)) {
			// good, it is a number
		} else {
			throw new Error('Parameter must be an integer');
		}
	} else {
		length = getConfigSetting('nonce-size', 24);
	}

	const value = crypto.randomBytes(length);
	return value;
};

module.exports.getClassMethods = (clazz) => {
	const i = new clazz();
	const proto = Object.getPrototypeOf(i);
	return Object.getOwnPropertyNames(proto).filter(
		(e) => {
			if (e !== 'constructor' && typeof i[e] === 'function') {
				return true;
			}
		});
};

module.exports.getBufferBit = (buf, idx) => {
	// return error=true if bit to mask exceeds buffer length
	if ((parseInt(idx / 8) + 1) > buf.length) {
		return {error: true, invalid: 0};
	}
	if ((buf[parseInt(idx / 8)] & (1 << (idx % 8))) !== 0) {
		return {error: false, invalid: 1};
	} else {
		return {error: false, invalid: 0};
	}
};

const getDefaultKeyStorePath = () => {
	return path.join(os.homedir(), '.hfc-key-store');
};
module.exports.getDefaultKeyStorePath = getDefaultKeyStorePath;

module.exports.newCryptoKeyStore = (opts, KVSImplClass) => {
	// this function supports skipping any of the arguments such that it can be called in any of the following fashions:
	// - newCryptoKeyStore({name: 'member_db', url: 'http://localhost:5984'},CouchDBKeyValueStore)
	// - newCryptoKeyStore({path: '/tmp/app-state-store'})
	// - newCryptoKeyStore()

	if (!opts) {
		opts = {path: getDefaultKeyStorePath()};
	}
	if (!KVSImplClass || !(KVSImplClass.prototype instanceof KeyValueStore)) {
		KVSImplClass = require(getConfigSetting('key-value-store'));
	}

	const cksImpl = getConfigSetting('crypto-key-store');
	const CryptoKeyStore = require(cksImpl);
	const kvsInstance = new KVSImplClass(opts);
	return new CryptoKeyStore(kvsInstance);
};

/*
 * This function will create a new key value pair type options list based
 * on the one passed in. The option setting will be added to the options if it
 * does not exist in the options already. The value of the setting being checked
 * will be the default value passed in unless there is a value in the config
 * settings or already on the options list.
 */
module.exports.checkAndAddConfigSetting = (option_name, default_value, options) => {
	const return_options = {};
	return_options[option_name] = getConfigSetting(option_name, default_value);
	if (options) {
		const keys = Object.keys(options);
		for (const i in keys) {
			const key = keys[i];
			const value = options[key];
			return_options[key] = value;
		}
	}
	return return_options;
};

/*
 * Make sure there's a start line with '-----BEGIN CERTIFICATE-----'
 * and end line with '-----END CERTIFICATE-----', so as to be compliant
 * with x509 parsers
 */
module.exports.normalizeX509 = (raw) => {
	const regex = /(-----\s*BEGIN ?[^-]+?-----)([\s\S]*)(-----\s*END ?[^-]+?-----)/;
	let matches = raw.match(regex);
	if (!matches || matches.length !== 4) {
		throw new Error('Failed to find start line or end line of the certificate.');
	}

	// remove the first element that is the whole match
	matches.shift();
	// remove LF or CR
	matches = matches.map((element) => {
		return element.trim();
	});

	// make sure '-----BEGIN CERTIFICATE-----' and '-----END CERTIFICATE-----' are in their own lines
	// and that it ends in a new line
	return matches.join('\n') + '\n';
};

/*
 * Convert a PEM encoded certificate to DER format
 * @param {string) pem PEM encoded public or private key
 * @returns {string} hex Hex-encoded DER bytes
 * @throws Will throw an error if the conversation fails
 */
module.exports.pemToDER = (pem) => {

	// PEM format is essentially a nicely formatted base64 representation of DER encoding
	// So we need to strip "BEGIN" / "END" header/footer and string line breaks
	// Then we simply base64 decode it and convert to hex string
	const contents = pem.toString().trim().split(/\r?\n/);
	// check for BEGIN and END tags
	if (!(contents[0].match(/-----\s*BEGIN ?([^-]+)?-----/) &&
		contents[contents.length - 1].match(/-----\s*END ?([^-]+)?-----/))) {
		throw new Error('Input parameter does not appear to be PEM-encoded.');
	}
	contents.shift(); // remove BEGIN
	contents.pop(); // remove END
	// base64 decode and encode as hex string
	// var hex = Buffer.from(contents.join(''), 'base64').toString('hex');
	const hex = Buffer.from(contents.join(''), 'base64');
	return hex;
};

module.exports.checkIntegerConfig = (opts, configName) => {
	let result = false;
	if (opts && opts[configName]) {
		if (!Number.isInteger(opts[configName])) {
			throw new Error(`Expect an integer value of ${configName}, found ${typeof configName}`);
		}
		result = true;
	}
	return result;
};

module.exports.convertBytetoString = (buffer_array, encoding) => {
	let result;
	let decode_as = 'utf8';
	if (!encoding) {
		decode_as = encoding;
	}
	if (Array.isArray(buffer_array)) {
		const a_strings = [];
		for (const index in buffer_array) {
			const buffer = buffer_array[index];
			const hex_string = buffer.toString(decode_as);
			a_strings.push(hex_string);
		}
		result = a_strings.join('');
	} else {
		result = buffer_array.toString(decode_as);
	}

	return result;
};