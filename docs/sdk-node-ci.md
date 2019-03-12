# Continuous Integration Process

## Branches

- Master branch contains the latest changes. All development Gerrit patchsets usually needs to be sent to master.

## Continuous Integration

- Every Gerrit patchset triggers a verify job and run the below tests from `Jenkinsfile`.

    - Headless & Integration Tests (gulp test)

All the above tests run on Hyperledger infarstructure x86_64 and s390x build nodes. All these nodes uses packer with pre-configured software packages. This helps us to the run tests in much faster than installing required packages for every build.

#### Headless & Integration Tests

- We run `gulp test` target to run the headless and Integration tests.

#### Supported platforms

- x86_64
- s390x

#### CI Process Flow

As we trigger `fabric-sdk-node-verify-x86_64` and `fabric-sdk-node-verify-s390x` pipeline jobs for every gerrit patchset, we execute the tests in the below order

CleanEnvironment -- OutputEnvironment -- CloneRefSpec -- Pull Build Artifacts -- Headless & Integration Tests **[VERIFY FLOW]**

and below is the series of stages for the merge job flow. (`fabric-sdk-node-merge-x86_64`, `fabric-sdk-node-merge-s390x`)

CleanEnvironment -- OutputEnvironment -- CloneRefSpec -- Pull Build Artifacts -- Headless & Integration Tests -- Publish NPM snapshot modules -- Publish API Docs **[MERGE FLOW]**

- After the cleanEnvironment and Display the environment details on the Jenkins console, it fetches the Gerrit refspec and try to pull the images from nexus3 repository. The ci.properties file is key here, specify what images you would like build to pull from nexus3. After images are successfully pulled, the next stage is to execute **Headless and Integration Tests**. Once the tests are executed successfully, it checks the condition whether it is a verify or merge. If it is a merge job, Jenkins triggers the **publish npm modules** and **api docs** stages.

- Snapshot npm modules can be seen here. https://www.npmjs.com/package/fabric-client, https://www.npmjs.com/package/fabric-ca-client etc..

- API docs can be accessible from https://fabric-sdk-node.github.io/master/index.html

- Jenkins sends build notifications only on the merge failure job. Jenkins sends build notifications to RocketChat `jenkins-robot` channel and an email to the owner of the patchset.

#### Trigger failed jobs through gerrit comments

Developers can re-trigger the failed verify jobs by post **reverify** as a comment phrase to the gerrit change set that retriggers all the verify jobs. To do so, follow the below process:

Step 1: Open the gerrit patch set for which you want to reverify the build

Step 2: Click on Reply, then type **reverify** and click on post

This kicks off all the fabric-sdk-node verify jobs. Once the build is triggered, you can observe the Jenkins console output, if you are interested in viewing the logs messages to determine how well the build jobs are progressing.

In some cases, builds may fail on x or z platforms due to network connectivity issues or code changes specific to the platform, in such cases, developer can post below comments to trigger the particular failed build:
    
    ```
      reverify-z - to restart the build on sdk-node-verify s390x platform.
      reverify-x - to restart the build on sdk-node-verify x86_64 platform.
      remerge-z - to restart the build on sdk-node-verify s390x platform.
      remerge-x - to restart the build on sdk-node-verify x86_64 platform.
    ```
#### Where to see the output of the stages?

Piepline supports two views (stages and blueocean). Staged views shows on the Jenkins job main page and it shows each stage in order and the status. For better view, we suggest you to access BlueOcean plugin. Click on the JOB Number and click on the **Open Blue Ocean** link that shows the build stages in pipeline view. Also, we capture the `.logs files` and keep them on the Job console.

#### How to add more stages to this pipeline flow?

We use scripted pipeline syntax with groovy and shell scripts. Also, we use global shared library scripts which are placed in https://github.com/hyperledger/ci-management/tree/master/vars. Try to leverage the common functions in your code. All you have to do is, undestand the pipeline flow of the tests, add one more stage as mentioned in the existing Jenkinsfile.

#### Build Scripts

Multiple build scripts are used in fabric-ca CI flow. We use global shared library scripts and Jenkinsfile. 

Global Shared Library - https://github.com/hyperledger/ci-management/tree/master/vars

Jenkinsfile           - https://github.com/hyperledger/fabric-sdk-node/tree/master/Jenkinsfile

ci.properties         - https://github.com/hyperledger/fabric-ca/tree/master/ci.properties
(ci.properties is the only file you have to modify with the values requried for the specific branch.)

Packer Scripts        - https://github.com/hyperledger/ci-management/blob/master/packer/provision/docker.sh
(Packer is a tool for automatically creating VM and container images, configuring them and post-processing them into standard output formats. We build Hyperledger's CI images via Packer and attach them to x86_64 build nodes. On s390x, we install manually. See the packages we install as a pre-requisite in the CI x86 build nodes.)