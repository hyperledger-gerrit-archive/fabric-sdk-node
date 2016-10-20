/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * This is the configuration class for the "hfc" (Hyperledger Fabric Client) package.
 * It provides all configuration settings using "config" node.js package to retrieve the
 * settings from JSON based files, environment settings, and command line startup settings
 *
 * configuration settings will be overridden in this order
 *  first files are loaded in this order
 *    $NODE_CONFIG_DIR/default.json
 *    $NODE_CONFIG_DIR/$NODE_ENV.json
 *
 *  NODE_CONFIG_DIR defaults to './config'  the configuration directory is relative to where the application is started
 *  NODE_ENV        defaults to 'development'
 *
 * then then following environment setting will override file settings
 *     $NODE_CONFIG
 *  $ export NODE_CONFIG='{"request-timeout": 3000 }'
 *
 * then the command line setting will override all
 *     node myapp.js --NODE_CONFIG='{"request-timeout": 7000 }'
 *
 *
 *   see the following for complete information on the configuration settings
 *         https://www.npmjs.com/package/config
 */

var utils = require('./utils.js');
var logger = utils.getLogger('Config.js');

/**
 * The class representing the configuration settings.
 *
 * @class
 */
var Config = class {

	/**
	 * @param {string} name to identify different chain instances. The naming of chain instances
	 * is completely at the client application's discretion.
	 */
	constructor(config) {
		// reference to configuration settings
		this._config = config;
	}

	/**
	 * Get the config setting with name.
	 * If the setting is not found return the default value provided.
	 * @returns {value} The value
	 */
	get(name, default_value) {
		logger.debug('Config.get - name:' + name + ' default value:' + default_value);

		var return_value = null;

		try {
			return_value = this._config.get(name);
		}
		catch(err) {
			logger.debug('Config.get - name:' + name + ' not found using default value:' + default_value);
			return_value = default_value;
		}
		return return_value;
	}

};

module.exports = Config;