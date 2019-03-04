#!groovy

// Copyright IBM Corp All Rights Reserved
//
// SPDX-License-Identifier: Apache-2.0
//

@Library("fabric-ci-lib") _ // global shared library from ci-management repository
timestamps { // set the timestamps on the jenkins console
  timeout(40) { // Build timeout set to 40 mins
    if(env.NODE_ARCH != "hyp-x") {
      node ('hyp-z') { // trigger jobs on s390x builds nodes
        env.NODE_VER = "8.14.0" // Set node version
        env.GOPATH = "$WORKSPACE/gopath"
        env.PATH = "$GOPATH/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin:~/npm/bin:/home/jenkins/.nvm/versions/node/v${NODE_VER}/bin:$PATH"
        buildStages() // call buildStages
      } // End node
    } else {
      node ('hyp-x') { // trigger jobs on x86_64 builds nodes
        def nodeHome = tool 'nodejs-8.14.0'
        env.GOPATH = "$WORKSPACE/gopath"
        env.PATH = "$GOPATH/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin:${nodeHome}/bin:$PATH"
        buildStages() // call buildStages
      } // end node block
    }
  } // end timeout block
} // end timestamps block

def ROOTDIR = pwd() // workspace dir (/w/workspace/<job_name>)
def failure_stage = "none"
// set MARCH value to amd64, s390x, ppc64le
env. MARCH = sh(returnStdout: true, script: "uname -m | sed 's/x86_64/amd64/g'").trim()
def buildStages() {
    try {
      stage('Clean Environment') {
        // delete working directory
        deleteDir()
        // Clean build environment before start the build
        fabBuildLibrary.cleanupEnv()
        // Display jenkins environment details
        fabBuildLibrary.envOutput()
      }

      stage('Checkout SCM') {
        // Get changes from gerrit
        fabBuildLibrary.cloneRepo 'fabric-sdk-node'
        // Load properties from ci.properties file
        props = fabBuildLibrary.loadProperties()
      }

      stage("Pull Build Artifacts") {
        dir("$ROOTDIR/$BASE_DIR") {
          if(props["SKIP_PULL_IMAGES"] == "true") {
            // call buildFabric to clone and build images
            fabBuildLibrary.cloneScm('fabric', '$GERRIT_BRANCH')
            env.GOROOT = "/opt/go/go" + props["GO_VER"] + ".linux." + "$MARCH"
            env.GOPATH = "$GOPATH/bin"
            env.PATH = "$GOROOT/bin:$GOPATH/bin:$PATH"
            fabBuildLibrary.fabBuildImages('fabric', 'docker')
            // Pull images from nexus3
            fabBuildLibrary.pullDockerImages(props["FAB_BASE_VERSION"], 'javaenv nodenv')
            // Pull Thirdparty Docker Images from hyperledger DockerHub
            fabBuildLibrary.pullThirdPartyImages(props["FAB_BASEIMAGE_VERSION"], props["FAB_THIRDPARTY_IMAGES_LIST"])
          } else {
            // Pull Docker Images from nexus3
            fabBuildLibrary.pullDockerImages(props["FAB_BASE_VERSION"], props["FAB_IMAGES_LIST"])
            // Pull Thirdparty Docker Images from hyperledger DockerHub
            fabBuildLibrary.pullThirdPartyImages(props["FAB_BASEIMAGE_VERSION"], props["FAB_THIRDPARTY_IMAGES_LIST"])
          }
        }
      }
      // Run gulp tests (headless and integration tests)
      stage("Headless & Integration Tests") {
        wrap([$class: 'AnsiColorBuildWrapper', 'colorMapName': 'xterm']) {
          try {
            dir("$ROOTDIR/$PROJECT_DIR/scripts/ci_scripts") {
              // Get the testFabricVersion and thirdpartyVersion from package.json
              // and Pull the DockerImages from dockerhub and run the Integration Tests
              sh './ciScript.sh --sdk_E2e_Tests'
            }
          }
          catch (err) {
            failure_stage = "sdk_E2e_Tests"
            currentBuild.result = 'FAILURE'
            throw err
          }
        }
      }

// Publish npm modules only from amd64 merge jobs
if ((env.JOB_TYPE == "merge") && (env.MARCH = "amd64")) {
  publishNpm()
  apiDocs()
} else {
  echo "Don't publish npm modules and api docs from VERIFY job"
}
    } finally { // post build actions
        // Don't fail build if there is no coverage report file
        step([$class: 'CoberturaPublisher', autoUpdateHealth: false, autoUpdateStability: false,
              coberturaReportFile: '**/cobertura-coverage.xml', failUnhealthy: false, failUnstable: false,
              failNoReports: false, maxNumberOfBuilds: 0, onlyStable: false, sourceEncoding: 'ASCII',
              zoomCoverageChart: false])
        // Don't fail build if there is no log file
        archiveArtifacts allowEmptyArchive: true, artifacts: '**/*.log'
        // Send notifications only for merge failures
        if (env.JOB_TYPE == "merge") {
          if (currentBuild.result == 'FAILURE') {
            // Send notification to rocketChat channel
            // Send merge build failure email notifications to the submitter
            sendNotifications(currentBuild.result, props["CHANNEL_NAME"])
          }
        }
      } // end finally block
} // end buildStages

def publishNpm() {
  // Publish npm modules after successful merge
  stage("Publish npm Modules") {
    sh 'echo "-------> Publish npm Modules"'
    withCredentials([[$class       : 'StringBinding',
                    credentialsId: 'NPM_LOCAL',
                    variable : 'NPM_TOKEN']]) {
      try {
        dir("$ROOTDIR/$PROJECT_DIR/scripts/ci_script") {
          sh './ciScript.sh --publish_NpmModules'
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
    sh 'echo "--------> Publish API Docs"'
    withCredentials([[$class     : 'UsernamePasswordMultiBinding',
                         credentialsId: 'sdk-node-credentials',
                         usernameVariable: 'NODE_SDK_USERNAME',
                         passwordVariable: 'NODE_SDK_PASSWORD']]) {
    try {
      dir("$ROOTDIR/$PROJECT_DIR/scripts/ci_script") {
        sh './ciScript.sh --publish_ApiDocs'
      }
    }
    catch (err) {
      failure_stage = "publish_Api_Docs"
      currentBuild.result = 'FAILURE'
      throw err
    }
    }
  }
}
