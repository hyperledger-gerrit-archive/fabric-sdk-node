Fabric =class {
   /**
    * @param {string} name to identify different fabric instances. The naming of fabric instances
    * is completely at the client application's discretion.
    */
   constructor(name,tls,dev) {
      var tutil = require('../test/unit/test-util.js');
      var fs = require('fs');
   
      // Name of the fabric is only meaningful to the client
      this._name = name;

      // TLS enabled flag
      this._tlsEnabled =  ( tls == undefined )? Boolean(false) : tls

      // A peer cache associated with this fabric
      this._peers = {}; // associated array of [name] <-> Peer

      this._devMode =  ( dev == undefined )? Boolean(false) : dev 

   }                

   isTlsEnabled() {
      return this._tlsEnabled;
   }

   isDevMode() {
      return this._devMode;
   }

   getName() {
      return this._name;
   }

   getPeers() {
      return this._peers;
   }

   start () {
      var tutil = require('../test/unit/test-util.js');
      var dockerFile='./docker-compose.yml'
      if (this.isTlsEnabled()) { var dockerFile='./docker-compose.tls.yml' }
      var spawn = require('child_process').spawnSync;
      return new Promise(function(resolve, reject) {
         var net = spawn(  'docker-compose',
                           ['-f', dockerFile, 'up', '-d', '--build'],
                           {
                              encoding: 'utf8',
                              stdio: [ 'ignore', 'pipe', 'pipe' ],
                              cwd: tutil.goPath + '/src/github.com/hyperledger/fabric-sdk-node/test/unit',
                           });
         if (net.status != 0 && (typeof net.status != null)) {
            console.log('rejected');
            return reject(net);
         } else { 
            return resolve(net); 
         }
      });   
   } 

   stop () {
      var tutil = require('../test/unit/test-util.js');
      var dockerFile='./docker-compose.yml'
      if (this.isTlsEnabled()) { var dockerFile='./docker-compose.tls.yml' }
      var spawn = require('child_process').spawnSync;
      return new Promise(function(resolve, reject) {
         var net = spawn(  'docker-compose',
                           ['-f', dockerFile, 'stop'],
                           {
                              encoding: 'utf8',
                              stdio: [ 'ignore', 'pipe', 'pipe' ],
                              cwd: tutil.goPath + '/src/github.com/hyperledger/fabric-sdk-node/test/unit',
                           });
         if (net.status != 0 && (typeof net.status != null)) {
            console.log('rejected');
            return reject(net);
         } else { 
            var net = spawn(  'docker-compose',
                              ['-f', dockerFile, 'rm', '-f'],
                              {
                                 encoding: 'utf8',
                                 stdio: [ 'ignore', 'pipe', 'pipe' ],
                                 cwd: tutil.goPath + '/src/github.com/hyperledger/fabric-sdk-node/test/unit',
                              });
            if (net.status != 0 && (typeof net.status != null)) {
               console.log('rejected');
               return reject(net);
            } else { 
               return resolve(net); 
            }
         }
      });   
   } 

} 
module.exports  = Fabric
