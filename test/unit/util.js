var path = require('path');

module.exports.CHAINCODE_PATH = 'github.com/example_cc';

// directory for file based KeyValueStore
module.exports.KVS = '/tmp/hfc-test-kvs';

// url for the CouchDB based KeyValueStore
if (!process.env.DB_IP_ADDR || process.env.DB_IP_ADDR === '') {
	process.env.DB_IP_ADDR = 'http://192.168.99.100';
}
module.exports.KVSDB = process.env.DB_IP_ADDR + ':5984';

// default KeyValueStore is file
process.env.KVS_IMPL = 'file';

// temporarily set $GOPATH to the test fixture folder
module.exports.setupChaincodeDeploy = function() {
	process.env.GOPATH = path.join(__dirname, '../fixtures');
};
