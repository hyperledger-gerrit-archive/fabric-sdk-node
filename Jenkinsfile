// Copyright IBM Corp All Rights Reserved
//
// SPDX-License-Identifier: Apache-2.0
//

// Pipeline script for fabric-sdk-node

node ('hyp-x && hyp-z') { // trigger build on x86_64 node
    def ROOTDIR = pwd() // workspace dir (/w/workspace/<job_name>
    env.PROJECT_DIR = "gopath/src/github.com/hyperledger"
    def failure_stage = "none"
    // delete working directory
    deleteDir()
      stage("Fetch Patchset") { // fetch gerrit refspec on latest commit
          try {
              dir("${ROOTDIR}"){
              sh '''
                 [ -e gopath/src/github.com/hyperledger/fabric-sdk-node ] || mkdir -p $PROJECT_DIR
                 cd $PROJECT_DIR
                 git clone git://cloud.hyperledger.org/mirror/fabric-sdk-node && cd fabric-sdk-node
                 git fetch origin "$GERRIT_REFSPEC" && git checkout FETCH_HEAD
              '''
              }
          }
          catch (err) {
                 failure_stage = "Fetch patchset"
                 throw err
           }
      }
// clean environment and get env data
      stage("Clean Environment - Get Env Info") {
           try {
                 dir("${ROOTDIR}/$PROJECT_DIR/fabric-sdk-node/scripts/Jenkins_Scripts") {
                 sh './CI_Script.sh --clean_Environment --env_Info'
                 }
               }
           catch (err) {
                 failure_stage = "Clean Environment - Get Env Info"
                 throw err
           }
      }

    // Pull Couchdb Image
      stage("Pull Couchdb image") {
           try {
                 dir("${ROOTDIR}/$PROJECT_DIR/fabric-sdk-node/scripts/Jenkins_Scripts") {
                 sh './CI_Script.sh --pull_Thirdparty_Images'
                 }
               }
           catch (err) {
                 failure_stage = "Pull couchdb docker image"
                 throw err
           }
      }

// Pull Fabric, Fabric-ca Images
      stage("Pull Docker images") {
           try {
                 dir("${ROOTDIR}/$PROJECT_DIR/fabric-sdk-node/scripts/Jenkins_Scripts") {
                 sh './CI_Script.sh --pull_Fabric_Images --pull_Fabric_CA_Image'
                 }
               }
           catch (err) {
                 failure_stage = "Pull fabric, fabric-ca docker images"
                 throw err
           }
      }

// Run gulp tests (headless and e2e tests)
      stage("Run gulp_Tests") {
           try {
                 dir("${ROOTDIR}/$PROJECT_DIR/fabric-sdk-node/scripts/Jenkins_Scripts") {
                 sh './CI_Script.sh --sdk_e2e_Tests'
                 }
               }
           catch (err) {
                 failure_stage = "sdk_e2e_Tests"
                 throw err
           }
      }
}
