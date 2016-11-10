const tutil = require('./test-util.js');
const path = require('path');

var cwd = __dirname;
var keyStores = [ '/home/ibmadmin/gopath/src/github.com/hyperledger/fabric-sdk-node/test/tmp' ];

keyStores.forEach(function(value){
   tutil.rmdir(value);
   console.log('removing ', value); 
});

