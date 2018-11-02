// Copyright IBM Corp All Rights Reserved
//
// SPDX-License-Identifier: Apache-2.0
//
node ('hyp-x') { // trigger build on x86_64 node test
  timestamps {
    try {
     def ROOTDIR = pwd() // workspace dir (/w/workspace/<job_name>)
     env.PROJECT_DIR = "gopath/src/github.com/hyperledger"
     env.GOPATH = "$WORKSPACE/gopath"
     withEnv(["PATH+NODE=${tool name: 'node-8.9.4', type: 'jenkins.plugins.nodejs.tools.NodeJSInstallation'}/bin"]) {
     }
     env.PATH = "$GOPATH/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin:~/npm/bin:$PATH"
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
                 git checkout "$GERRIT_BRANCH" && git fetch origin "$GERRIT_REFSPEC" && git checkout FETCH_HEAD
              '''
              }
          }
          catch (err) {
                 failure_stage = "Fetch patchset"
                 currentBuild.result = 'FAILURE'
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
                 currentBuild.result = 'FAILURE'
                 throw err
           }
         }

// Run gulp tests (headless and Integration tests)
      stage("Run gulp_Tests") {
         wrap([$class: 'AnsiColorBuildWrapper', 'colorMapName': 'xterm']) {
           try {
                 dir("${ROOTDIR}/$PROJECT_DIR/fabric-sdk-node/scripts/Jenkins_Scripts") {
                 echo "SKIP FOR NOW"
                 sh './CI_Script.sh --sdk_E2e_Tests'
                 }
               }
           catch (err) {
                 failure_stage = "sdk_E2e_Tests"
                 currentBuild.result = 'FAILURE'
                 throw err
           }
         }
      }

// Publish npm modules from merged job
if (env.GERRIT_EVENT_TYPE == "patchset-created") {
    publishNpm()
}  else {
     echo "------> Don't publish npm modules from verify job"
   }

// Publish API Docs from merged job only
if (env.GERRIT_EVENT_TYPE == "patchset-created") {
    apiDocs()
} else {
     echo "------> Don't publish API Docs from verify job"
   }
     } finally {
           step([$class: 'CoberturaPublisher', autoUpdateHealth: false, autoUpdateStability: false, coberturaReportFile: '**/cobertura-coverage.xml', failUnhealthy: false,  failNoReports: false, failUnstable: false, maxNumberOfBuilds: 0, onlyStable: false, sourceEncoding: 'ASCII', zoomCoverageChart: false])
           archiveArtifacts allowEmptyArchive: true, artifacts: '**/*.log'
           if (env.GERRIT_EVENT_TYPE == 'patchset-created') {
              if (currentBuild.result == 'FAILURE') { // Other values: SUCCESS, UNSTABLE
               // Sends notification to Rocket.Chat
               rocketSend channel: 'jenkins-robot', message: "Build Notification - STATUS: ${currentBuild.result} - BRANCH: ${env.GERRIT_BRANCH} - PROJECT: ${env.PROJECT} - BUILD_URL:  ${env.BUILD_URL}"
              }
           }
       }
  } // timestamps block
} // node block

def publishNpm() {
// Publish npm modules after successful merge
      stage("Publish npm Modules") {
      def ROOTDIR = pwd()
      withCredentials[$class       : 'StringBinding',
                      credentialsId: 'NPM_LOCAL',
                      variable : 'NPM_TOKEN']]) {
           try {
                 echo "-------> Publish npm Module"
                 dir("${ROOTDIR}/$PROJECT_DIR/fabric-sdk-node/scripts/Jenkins_Scripts") {
                 sh './CI_Script.sh --publish_NpmModules'
                 }
               }
           catch (err) {
                 failure_stage = "publish_NpmModules"
                 currentBuild.result = 'FAILURE'
                 throw err
           }
      }
      }
}

def apiDocs() {
// Publish SDK_NODE API docs after successful merge
      stage("Publish API Docs") {
      def ROOTDIR = pwd() 
           try {
                 echo "-------> Publish API Docs"
                 dir("${ROOTDIR}/$PROJECT_DIR/fabric-sdk-node/scripts/Jenkins_Scripts") {
                 sh './CI_Script.sh --publish_ApiDocs'
                 }
               }
           catch (err) {
                 failure_stage = "publish_ApiDocs"
                 currentBuild.result = 'FAILURE'
                 throw err
           }
      }
}

