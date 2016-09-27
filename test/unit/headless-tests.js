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

var test = require('tape');
var hfc = require('../..');
var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;
var utils = require('../../lib/utils.js');

var grpc = require('grpc');
var _fabricProto = grpc.load(path.join(__dirname,"../../lib/protos/fabric.proto")).protos;
var _chaincodeProto = grpc.load(path.join(__dirname,"../../lib/protos/chaincode.proto")).protos;

// FileKeyValueStore tests /////////////
var FileKeyValueStore = require('../../lib/FileKeyValueStore.js');

var keyValStorePath = path.join(getUserHome(), "kvsTemp");
//Note: unix relative path does not start with '/'
//windows relative path starts with '/'
var keyValStorePath1 = "tmp/keyValStore1";
var keyValStorePath2 = "/tmp/keyValStore2";
var testKey = "keyValFileStoreName";
var testValue = "secretKeyValue";
var store1 = "";
var store2 = "";
// End: FileKeyValueStore tests ////////

// Chain tests /////////////
var Chain = require('../../lib/Chain.js');
var chainName = "testChain";
var chainKeyValStorePath = "tmp/chainKeyValStorePath";
var store3 = "";
// End: Chain tests ////////

// Member tests //////////
var Member = require('../../lib/Member.js');
var memberName = "Donald T. Duck";
var enrollmentID = 123454321;
var roles = ["admin", "user"];
var account = "xyz7364562";
var affiliation = "Hyperledger Community";
var memberCfg = {"enrollmentID": enrollmentID ,
        "roles": roles,
        "account": account,
        "affiliation": affiliation};

// Peer tests ////////
// var Peer = require('../../lib/Peer.js');
// var EventEmitter = require('events');
// End: Peer tests ////////


//
// Run the FileKeyValueStore test
//
test('FileKeyValueStore read and write test', function(t) {
    // clean up
    fs.existsSync(keyValStorePath, (exists) => {
        if (exists) {
            execSync('rm -rf ' + keyValStorePath);
        }
    });

    var store = new FileKeyValueStore({
        path: keyValStorePath
    });

    fs.exists(keyValStorePath, (exists) => {
        if (exists)
            t.pass("FileKeyValueStore read and write test: Successfully created new directory for testValueStore");
        else {
            t.fail("FileKeyValueStore read and write test: Failed to create new directory: " + keyValStorePath);
            t.end();
        }
    });

    store.setValue(testKey, testValue)
    .then(function(result) {
        if (result) {
            t.pass("FileKeyValueStore read and write test: Successfully set value");

            fs.exists(path.join(keyValStorePath, testKey), (exists) => {
                if (exists)
                    t.pass("FileKeyValueStore read and write test: Verified the file for key " + testKey + " does exist");
                else {
                    t.fail("FileKeyValueStore read and write test: Failed to create file for key " + testKey);
                    t.end();
                }
            });
        } else {
            t.fail("FileKeyValueStore read and write test: Failed to set value");
            t.end();
        }
    });

    store.getValue(testKey)
    .then(
        // Log the fulfillment value
        function(val) {
            if (val != testValue) {
                t.fail("FileKeyValueStore read and write test: "+ val + " does not equal testValue of " + testValue);
                t.end();
            } else
                t.pass("FileKeyValueStore read and write test: Successfully retrieved value");
        })
    .catch(
        // Log the rejection reason
        function(reason) {
            t.fail(reason);
        });

    t.end();
});

test('FileKeyValueStore constructor test', function(t) {
    cleanupFileKeyValueStore(keyValStorePath1);
    cleanupFileKeyValueStore(keyValStorePath2);

    console.log("keyValStorePath1: "+keyValStorePath1);
    console.log("relativePath: "+getRelativePath(keyValStorePath1));
    store1 = new FileKeyValueStore({path: getRelativePath(keyValStorePath1)});
    console.log("absolutePath: "+getAbsolutePath(keyValStorePath1));
    var exists = utils.existsSync(getAbsolutePath(keyValStorePath1));
    if (exists)
        t.pass("FileKeyValueStore constructor test:  Successfully created new directory");
    else
        t.fail("FileKeyValueStore constructor test:  Failed to create new directory: " + keyValStorePath1);

    console.log("keyValStorePath2: "+keyValStorePath2);
    console.log("relativePath: "+getRelativePath(keyValStorePath2));
    store2 = new FileKeyValueStore({path: getRelativePath(keyValStorePath2)});    
    console.log("absolutePath: "+getAbsolutePath(keyValStorePath2));
    var exists = utils.existsSync(getAbsolutePath(keyValStorePath2));
    if (exists)
        t.pass("FileKeyValueStore constructor test:  Successfully created new directory");
    else
        t.fail("FileKeyValueStore constructor test:  Failed to create new directory: " + keyValStorePath2);

    t.end();
})

test('FileKeyValueStore setValue test', function(t) {
    store1.setValue(testKey, testValue)
    .then(function(result) {
        if (result) {
            t.pass("FileKeyValueStore store1 setValue test:  Successfully set value");

            var exists = utils.existsSync(getAbsolutePath(keyValStorePath1), testKey);
            if (exists) {
                t.pass("FileKeyValueStore store1 setValue test:  Verified the file for key " + testKey + " does exist");
                store1.getValue(testKey)
                .then(
                    // Log the fulfillment value
                    function(val) {
                        if (val != testValue) {
                            t.fail("FileKeyValueStore store1 getValue test:  "+ val + " does not equal testValue of " + testValue + "for FileKeyValueStore read and write test");
                        } else {
                            t.pass("FileKeyValueStore store1 getValue test:  Successfully retrieved value");
                        }
                    })
                .catch(
                    // Log the rejection reason
                    function(reason) {
                        t.fail(reason);
                    });
            } else {
                t.fail("FileKeyValueStore store1 setValue test:  Failed to create file for key " + testKey + "");
            }
        } else {
            t.fail("FileKeyValueStore store1 setValue test:  Failed to set value");
        }
    });
    store2.setValue(testKey, testValue)
    .then(function(result) {
        if (result) {
            t.pass("FileKeyValueStore store2 setValue test:  Successfully set value");

            var exists = utils.existsSync(getAbsolutePath(keyValStorePath2), testKey);
            if (exists) {
                t.pass("FileKeyValueStore store2 setValue test:  Verified the file for key " + testKey + " does exist");
                store2.getValue(testKey)
                .then(
                    // Log the fulfillment value
                    function(val) {
                        if (val != testValue) {
                            t.fail("FileKeyValueStore store2 getValue test:  "+ val + " does not equal testValue of " + testValue + "for FileKeyValueStore read and write test");
                        } else {
                            t.pass("FileKeyValueStore store2 getValue test:  Successfully retrieved value");
                        }
                    })
                .catch(
                    // Log the rejection reason
                    function(reason) {
                        t.fail(reason);
                    });
            } else {
                t.fail("FileKeyValueStore store2 setValue test:  Failed to create file for key " + testKey + "");
            }
        } else {
            t.fail("FileKeyValueStore store2 setValue test:  Failed to set value");
        }
    });

    t.end();
})

// Chain tests /////////////
test('Chain constructor test', function(t) {
    chain = new Chain(chainName);
    if (chain.getName() === chainName)
        t.pass("Chain constructor test: getName successful");
    else t.fail("Chain constructor test: getName not successful");
    t.end();
});

test('Chain setKeyValueStore getKeyValueStore test', function(t) {
    cleanupFileKeyValueStore(chainKeyValStorePath);

    chain.setKeyValueStore(hfc.newKeyValueStore({path: getRelativePath(chainKeyValStorePath)}));

    var exists = utils.existsSync(getAbsolutePath(chainKeyValStorePath));
    if (exists)
        t.pass("Chain setKeyValueStore test:  Successfully created new directory");
    else
        t.fail("Chain setKeyValueStore test:  Failed to create new directory: " + chainKeyValStorePath);

    store3 = chain.getKeyValueStore();
    store3.setValue(testKey, testValue)
    .then(function(result) {
        if (result) {
            t.pass("Chain getKeyValueStore test:  Successfully set value");

            var exists = utils.existsSync(getAbsolutePath(chainKeyValStorePath), testKey);
            if (exists)
                t.pass("Chain getKeyValueStore test:  Verified the file for key " + testKey + " does exist");
            else {
                t.fail("Chain getKeyValueStore test:  Failed to create file for key " + testKey + "");
            }
        } else {
            t.fail("Chain getKeyValueStore test:  Failed to set value");
        }
    });
    t.end();
});

// Member tests /////////
test('Member constructor set get tests', function(t) {
    var member1 = new Member(memberName, chain);
    if (member1.getName() === memberName)
        t.pass("Member constructor set get tests 1: new Member getName was successful");
    else
        t.fail("Member constructor set get tests 1: new Member getName was not successful");

    member1.setRoles(roles);
    if (member1.getRoles() &&
        member1.getRoles().indexOf("admin") > -1 &&
        member1.getRoles().indexOf("user") > -1)
        t.pass("Member constructor set get tests 1: setRoles getRoles was successful");

    if (member1.getChain().getName() === chainName)
        t.pass("Member constructor get set tests 1: getChain getName was successful");
    else
        t.fail("Member constructor get set tests 1: getChain getName was not successful");

    member1.setAccount(account);
    if (member1.getAccount() === account)
        t.pass("Member constructor get set tests 1: setAccount getAccount was successful");
    else
        t.pass("Member constructor get set tests 1: setAccount getAccount was not successful");
    
    member1.setAffiliation(affiliation);
    if (member1.getAffiliation() === affiliation)
        t.pass("Member constructor get set tests 1: setAffiliation getAffiliation was successful");
    else
        t.pass("Member constructor get set tests 1: setAffiliation getAffiliation was not successful");

    var member2 = new Member(memberCfg, chain);
    if (member2.getName() === enrollmentID)
        t.pass("Member constructor test 2: new Member cfg getName was successful");
    else
        t.fail("Member constructor test 2: new Member cfg getName was not successful");

    if (member2.getRoles() &&
        member2.getRoles().indexOf("admin") > -1 &&
        member2.getRoles().indexOf("user") > -1)
        t.pass("Member constructor test 2: new Member cfg getRoles was successful");
    else
        t.fail("Member constructor test 2: new Member cfg getRoles was not successful");

    if (member2.getAccount() === account)
        t.pass("Member constructor get set tests 2: new Member cfg getAccount was successful");
    else
        t.pass("Member constructor get set tests 2: new Member cfg getAccount was not successful");

    if (member1.getAffiliation() === affiliation)
        t.pass("Member constructor get set tests 1: new Member cfg getAffiliation was successful");
    else
        t.pass("Member constructor get set tests 1: new Member cfg getAffiliation was not successful");

    if (member2.getChain().getName() === chainName)
        t.pass("Member constructor get set tests 2: getChain new Member cfg getName was successful");
    else
        t.fail("Member constructor get set tests 2: getChain new Member cfg getName was not successful");

    t.end();

});



// test('Chain test', function(t) {
//     var chain = new Chain(chainName);

//     t.end();
// });

// test('Peer test', function(t) {
//     var peer = new Peer("grpc://localhost:7051");

//     var emitter = new EventEmitter();
//     emitter.on("submitted", function(data) {
//         t.pass("Successfully submitted transaction. " + data);
//         t.end();
//     });
//     emitter.on("error", function(err) {
//         t.fail("ERROR! " + err);
//         t.end();
//     });

//     peer.sendTransaction(
//         newDevModeDeployTransaction({
//             chaincodeName: "mycc",
//             fcn: "init",
//             args: ["a", "100", "b", "200"]
//         }), 
//         emitter);
// });

function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

/**
 * request: {
 *      chaincodeName: string,
 *      fcn: string,
 *      args: string[],
 * }
 */
function newDevModeDeployTransaction(request) {

    var tx = new _fabricProto.Transaction();
    tx.setType(_fabricProto.Transaction.Type.CHAINCODE_DEPLOY);

    // Set the chaincodeID
    var chaincodeID = new _chaincodeProto.ChaincodeID();
    chaincodeID.setName(request.chaincodeName);
    tx.setChaincodeID(chaincodeID.toBuffer());

    // Construct the ChaincodeSpec
    var chaincodeSpec = new _chaincodeProto.ChaincodeSpec();
    // Set Type -- GOLANG is the only chaincode language supported at this time
    chaincodeSpec.setType(_chaincodeProto.ChaincodeSpec.Type.GOLANG);
    // Set chaincodeID
    chaincodeSpec.setChaincodeID(chaincodeID);
    // Set ctorMsg
    var chaincodeInput = new _chaincodeProto.ChaincodeInput();
    chaincodeInput.setArgs(prepend(request.fcn, request.args));
    chaincodeSpec.setCtorMsg(chaincodeInput);

    // Construct the ChaincodeDeploymentSpec (i.e. the payload)
    var chaincodeDeploymentSpec = new _chaincodeProto.ChaincodeDeploymentSpec();
    chaincodeDeploymentSpec.setChaincodeSpec(chaincodeSpec);
    tx.setPayload(chaincodeDeploymentSpec.toBuffer());

    // Set the transaction UUID
    tx.setTxid(request.chaincodeName);

    // Set the transaction timestamp
    tx.setTimestamp(utils.GenerateTimestamp());

    tx.setConfidentialityLevel(_fabricProto.ConfidentialityLevel.PUBLIC);

    return {
        pb: tx,
        chaincodeID: request.chaincodeName
    };
}

function prepend(item, list) {
    var l = list.slice();
    l.unshift(item);
    return l.map(function(x) { return new Buffer(x) });
}

function cleanupFileKeyValueStore(keyValStorePath) {
    var absPath = getAbsolutePath(keyValStorePath);
    var exists = utils.existsSync(absPath);
    if (exists) {
        console.log("removing "+absPath);
        execSync('rm -rf ' + absPath);
    }
}

// prepend absolute path where this test is running, then join to the relative path
function getAbsolutePath(dir) {
    return path.join(__dirname, getRelativePath(dir));
};

// get relative file path for either Unix or Windows
// unix relative path does not start with '/'
// windows relative path starts with '/'
function getRelativePath(dir /*string*/) {
    if(/^win/.test(process.platform)) {
        if (!(dir.toString().substr(0,1) === "/")) dir = "/" + dir;
        dir = path.resolve(dir);
        dir = dir.replace(/([A-Z]:[\\\/]).*?/gi, '');
        return dir;
    } else {
        if (dir.toString().substr(0,1) === "/") dir = dir.substr(1);
        return dir;
    }
};

