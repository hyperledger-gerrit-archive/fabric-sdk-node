/**
 * Copyright IBM Corp. 2016 All Rights Reserved.
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

var Chain = require('../../lib/Chain.js');
var hfc = require('../..');
var util = require('util');
var utils = require('../../lib/utils.js');
var fs = require('fs');
var x509 = require('x509');
var FileKeyValueStore = require('../../lib/impl/FileKeyValueStore.js');
var execSync = require('child_process').execSync;

//Set defaults, if not set
var deployMode = process.env.SDK_DEPLOY_MODE
 ? process.env.SDK_DEPLOY_MODE
 : "net" ;
var keyStore = process.env.SDK_KEYSTORE
 ? process.env.SDK_KEYSTORE
 : "/tmp/keyValStore" ;
var caCert   = process.env.SDK_CA_CERT_FILE
 ? process.env.SDK_CA_CERT_FILE
 : "tlsca.cert" ;
var caCertHost = process.env.SDK_CA_CERT_HOST
 ? process.env.SDK_CA_CERT_HOST
 : "" ;
var caAddr   = process.env.SDK_MEMBERSRVC_ADDRESS
 ? process.env.SDK_MEMBERSRVC_ADDRESS
 : "localhost:7054" ;
var peerAddr0 = process.env.SDK_PEER_ADDRESS
 ? process.env.SDK_PEER_ADDRESS
 : "localhost:7051" ;
var eventHubAddr = process.env.SDK_EVENTHUB_ADDRESS
 ? process.env.SDK_EVENTHUB_ADDRESS
 : "localhost:7053" ;
var tlsOn    = ( process.env.SDK_TLS == null )
 ? Boolean(false)
 : Boolean(parseInt(process.env.SDK_TLS));
var keyStorePersist  = ( process.env.SDK_KEYSTORE_PERSIST == null )
 ? Boolean(true)
 : Boolean(parseInt(process.env.SDK_KEYSTORE_PERSIST));
var deployWait  = process.env.SDK_DEPLOYWAIT
 ? process.env.SDK_DEPLOYWAIT
 : 20;
var invokeWait  = process.env.SDK_INVOKEWAIT
 ? process.env.SDK_INVOKEWAIT
 : 5;
var ciphers = process.env.GRPC_SSL_CIPHER_SUITES
var goPath = process.env.GOPATH

var hsbnDns="zone.blockchain.ibm.com";
var hsbnCertPath="/root/certificate.pem";
var bluemixDns="us.blockchain.ibm.com";
var bluemixCertPath="/certs/blockchain-cert.pem";

console.log("deployMode      :"+deployMode       );
console.log("keyStore        :"+keyStore         );
console.log("caCert          :"+caCert           );
console.log("caAddr          :"+caAddr           );
console.log("peerAddr0       :"+peerAddr0        );
console.log("eventHubAddr    :"+eventHubAddr     );
console.log("tlsOn           :"+tlsOn            );
console.log("deployWait      :"+deployWait       );
console.log("invokeWait      :"+invokeWait       );
console.log("ciphers         :"+ciphers          );
console.log("hostOverride    :"+caCertHost       );
console.log("keyStorePersist :"+keyStorePersist  );
console.log("hsbnDns         :"+hsbnDns          );
console.log("hsbnCertPath    :"+hsbnCertPath     );
console.log("bluemixDns      :"+bluemixDns       );
console.log("bluemixCertPath :"+bluemixCertPath  );

// Given a certificate byte buffer of the DER-encoded certificate, return
// a PEM-encoded (64 chars/line) string with the appropriate header/footer
function certToPEM(cert, cb) {
    var pem = cert.encode().toString('base64');
    certStr = "-----BEGIN CERTIFICATE-----\n"
    for (var i = 0; i < pem.length; i++) {
       if ((i>0) && i%64 == 0) certStr += "\n";
       certStr += pem[i]
    }
    certStr += "\n-----END CERTIFICATE-----\n"
    cb(certStr)
}

function getTestChain(name) {
   name = name || "testChain";
   var chain = new Chain(name);

   // Delete the auth data, if requested
   if (!keyStorePersist) {
      fs.existsSync(keyStore, (exists) =>{
              if (exists){
                      execSync('rm -rf ' + keyStore);
              }
      });
   }

   var store = utils.newKeyValueStore({
           path: keyStore
   });

   chain.setKeyValueStore(hfc.newKeyValueStore({
      path: keyStore 
   }));

   // Set TLS-specific options if TLS is enabled
   if (tlsOn) {
      if (fs.existsSync(caCert)) {
         var pem = fs.readFileSync(caCert);
         console.log("Setting cert to " + caCert);
         if (caCertHost) { var grpcOpts={ pem:pem, hostnameOverride: caCertHost } }
         else { var grpcOpts={ pem:pem } };
         var proto = "grpcs://"
      } else {
         console.log("TLS was requested but " + caCert + " not found.")
         process.exit(1)
      }
   } else { proto = "grpc://" }
 
   console.log("Setting membersrvc address to " + proto  + caAddr);
   chain.setMemberServicesUrl(proto + caAddr, pem);
   console.log("Setting peer address to " + proto  + peerAddr0);
   chain.setOrderer(proto + peerAddr0, pem);
//   console.log("Setting eventHub address to " + proto  + eventHubAddr);
//   chain.eventHubConnect(proto + eventHubAddr, grpcOpts);

   //
   // Set the chaincode deployment mode to either developent mode (user runs chaincode)
   // or network mode (code package built and sent to the peer).
   if (deployMode === 'dev') {
       chain.setDevMode(true);
   } else {
       chain.setDevMode(false);
   }
//   chain.setDeployWaitTime(parseInt(deployWait));
//   chain.setInvokeWaitTime(parseInt(invokeWait));
   return chain;
}

function rmdir(path) {
  if( fs.existsSync(path) ) {
    fs.readdirSync(path).forEach(function(file,index){
      var curPath = path + "/" + file;
      if(fs.lstatSync(curPath).isDirectory()) { // recurse
        rmdir(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}

exports.goPath          = goPath;
exports.getTestChain = getTestChain;
exports.deployMode  = deployMode
exports.keyStore  = keyStore
exports.caCert    = caCert
exports.caAddr    = caAddr
exports.peerAddr0  = peerAddr0
exports.tlsOn     = tlsOn
exports.deployWait   = deployWait
exports.invokeWait   = invokeWait
exports.ciphers   = ciphers
exports.caCertHost = caCertHost
exports.eventHubAddr = eventHubAddr
exports.hsbnDns        = hsbnDns;
exports.hsbnCertPath   = hsbnCertPath;
exports.bluemixDns     = bluemixDns;
exports.bluemixCertPath = bluemixCertPath;
exports.keyStorePersist = keyStorePersist;
exports.rmdir = rmdir;
