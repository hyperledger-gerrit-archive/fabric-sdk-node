var sdkUtils = require('./utils.js');

/**
 * Base class for a client that can use a {@link CryptoSuite} to sign and hash.
 * It also contains utility methods for constructing new instances of {@link CryptoKeyStore},
 * [CryptoSuite]{@link module:api.CryptoSuite} and [KeyValueStore]{@link module:api.KeyValueStore}
 */
var BaseClient = class {
	constructor() {
		this._cryptoSuite = null;
	}

	/**
	 * Returns a new instance of the CryptoSuite API implementation.
	 *
	 * @param {object} setting This optional parameter is an object with the following optional properties:
	 * <br> - software {boolean}: Whether to load a software-based implementation (true) or HSM implementation (false)
   	 *    default is true (for software based implementation), specific implementation module is specified
	 *    in the setting 'crypto-suite-software'
	 * <br> - keysize {number}: The key size to use for the crypto suite instance. default is value of the setting 'crypto-keysize'
	 * <br> - algorithm {string}: Digital signature algorithm, currently supporting ECDSA only with value "EC"
	 * <br> - hash {string}: 'SHA2' or 'SHA3'
	 * @returns a new instance of the CryptoSuite API implementation
	 */
	static newCryptoSuite(setting) {
		return sdkUtils.newCryptoSuite(setting);
	}

	/**
	 * Sets the client instance to use the CryptoSuite object for signing and hashing
	 *
	 * Creating and setting a CryptoSuite is optional because the client will construct
	 * an instance based on default configuration settings:
	 * <br> - crypto-hsm: use an implementation for Hardware Security Module (if set to true) or software-based key management (if set to false)
	 * <br> - crypto-keysize: security level, or key size, to use with the digital signature public key algorithm. Currently ECDSA
	 *  is supported and the valid key sizes are 256 and 384
	 * <br> - crypto-hash-algo: hashing algorithm
	 * <br> - key-value-store: some CryptoSuite implementation requires a key store to persist private keys. A {@link CryptoKeyStore}
	 *  is provided for this purpose, which can be used on top of any implementation of the {@link KeyValueStore} interface,
	 *  such as a file-based store or a database-based one. The specific implementation is determined by the value of this configuration setting.
	 *
	 * @param {CryptoSuite} cryptoSuite the CryptoSuite object
	 */
	setCryptoSuite(cryptoSuite) {
		this._cryptoSuite = cryptoSuite;
	}

	/**
	 * Returns the {@link CryptoSuite} object used by this client instance
	 * @returns {CryptoSuite}
	 */
	getCryptoSuite() {
		return this._cryptoSuite;
	}

	/**
	 * Returns a new instance of the CryptoKeyStore.
	 *
	 * When the application needs to use a key store other than the default,
	 * it should create a new CryptoKeyStore and set it on the CryptoSuite.
	 *
	 * <br><br><code>cryptosuite.setCryptoKeyStore(Client.newCryptoKeyStore(KVSImplClass, opts))</code>
	 *
	 * @param {function} KVSImplClass Optional. The built-in key store saves private keys. The key store may be backed by different
	 * {@link KeyValueStore} implementations. If specified, the value of the argument must point to a module implementing the
	 * KeyValueStore interface.
	 * @param {object} opts Implementation-specific option object used in the constructor
	 * @returns a new instance of the CryptoKeystore
	 */
	static newCryptoKeyStore(KVSImplClass, opts) {
		return sdkUtils.newCryptoKeyStore(KVSImplClass, opts);
	}

	/**
	 * Obtains an instance of the [KeyValueStore]{@link module:api.KeyValueStore} class. By default
	 * it returns the built-in implementation, which is based on files ([FileKeyValueStore]{@link module:api.FileKeyValueStore}).
	 * This can be overriden with an environment variable KEY_VALUE_STORE, the value of which is the
	 * full path of a CommonJS module for the alternative implementation.
	 *
	 * @param {Object} options is whatever the implementation requires for initializing the instance. For the built-in
	 * file-based implementation, this requires a single property "path" to the top-level folder for the store
	 * @returns [KeyValueStore]{@link module:api.KeyValueStore} an instance of the KeyValueStore implementation
	 */
	static newDefaultKeyValueStore(options) {
		return sdkUtils.newKeyValueStore(options);
	}
};

module.exports = BaseClient;
