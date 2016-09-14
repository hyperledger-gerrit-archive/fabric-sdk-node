/**
 * Built-in implementation of [KeyValueStore]{@link module:api.KeyValueStore}. Uses
 * a top-level directory to hold files. Each key/value pair is saved in a separate file.
 *
 * @module FileKeyValueStore
 */

var api = require('./api.js');
var fs = require('fs');
var path = require('path');

/**
 * @class FileKeyValueStore
 * @memberof module:FileKeyValueStore
 */
module.exports = api.KeyValueStore.extend(/** @lends module:FileKeyValueStore.FileKeyValueStore.prototype */{

    _dir: "",   // root directory for the file store

    /**
     * @param {Object} options contains a single property "path" which points to the top-level directory
     * for the store
     */
    constructor: function(options) {
        if (!options || !options.path) {
            throw new Error('Must provide the path to the directory to hold files for the store.');
        }

        this._dir = options.path;
        if (!fs.existsSync(this._dir)) {
            fs.mkdirSync(this._dir);
        }
    },

    /**
     * Get the value associated with name.
     * @param {string} name
     * @returns Promise for the value
     */
    getValue: function(name) {
    	var self = this;

    	return new Promise(function(resolve, reject) {
	        var p = path.join(self._dir, name);
	        fs.readFile(p, 'utf8', function (err, data) {
	            if (err) {
	                if (err.code !== 'ENOENT') {
	                	reject(err);
	                } else {
                        return resolve(null);
                    }
	            }

	            return resolve(data);
	        });
    	});
    },

    /**
     * Set the value associated with name.
     * @param {string} name
     * @param {string} value
     * @returns Promise for a "true" value on successful completion
     */
    setValue: function (name, value) {
    	var self = this;

    	return new Promise(function(resolve, reject) {
	        var p = path.join(self._dir, name);
	        fs.writeFile(p, value, function(err) {
	        	if (err) {
	        		reject(err);
	        	} else {
                    return resolve(true);
                }
	        });
    	});
    }
});

