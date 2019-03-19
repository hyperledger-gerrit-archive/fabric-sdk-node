# Continuous Integration

- Every Gerrit patchset submitted to any branch of the fabric-sdk-node repository triggers a verify job and runs the below tests from the `Jenkinsfile`. We execute below tests as part of the verification process.

    - `gulp test-headless`, `gulp test-integration`, `gulp run-test-cucumber` and `gulp run-test-logger`

All the above tests runs on Hyperledger infarstructure x86_64 and s390x build nodes. All the x86_64 build nodes uses the packer with pre-configured software packages. This helps us to run the tests much faster than installing required packages for every build.

#### Tests

- CI script executes `gulp test-headless`, `gulp test-integration`, `gulp run-test-cucumber` and `gulp run-test-logger` targets to run the headless and Integration tests.

#### Supported platforms

- x86_64
- s390x

#### CI Process Flow

As we trigger `fabric-sdk-node-verify-x86_64` and `fabric-sdk-node-verify-s390x` pipeline jobs for every gerrit patchset, we execute the pipeline stages in the below order.

CleanEnvironment -- OutputEnvironment -- CloneRefSpec -- Headless & Integration Tests **[VERIFY FLOW]**

and below is the series of stages for the merge job flow. (`fabric-sdk-node-merge-x86_64`, `fabric-sdk-node-merge-s390x`)

CleanEnvironment -- OutputEnvironment -- CloneRefSpec -- Headless & Integration Tests -- Publish NPM snapshot modules -- Publish API Docs **[MERGE FLOW]**

- After cleanEnvironment and Display the environment details on the Jenkins console, CI scripts fetches the Gerrit refspec and try to execute **Headless and Integration Tests**. `docker-ready` is a sub target in `gulp test` which will try to pull release-1.4 latest stable images from Hyperledger DockerHub. Once the tests are executed successfully, it checks the condition whether it is a verify or merge. If it is a merge job, Jenkins triggers the **publish npm modules** and **api docs** stages and publishes the npm modules and api docs to gh-pages.

- Snapshot npm modules can be seen here. https://www.npmjs.com/package/fabric-client, https://www.npmjs.com/package/fabric-ca-client etc..

- API docs can be accessible from https://fabric-sdk-node.github.io/release-1.4/index.html

- Jenkins sends build notifications only on the merge failure job. Jenkins sends build notifications to RocketChat `jenkins-robot` channel and an email to the owner of the patchset.

#### Trigger failed jobs through gerrit comments

Developers can re-trigger the failed verify jobs by post **reverify** as a comment phrase to the gerrit change set that retriggers all the verify jobs. To do so, follow the below process:

Step 1: Open the gerrit patch set for which you want to reverify the build

Step 2: Click on Reply, then type **reverify** and click on post

This kicks off all the fabric-sdk-node verify jobs. Once the build is triggered, you can observe the Jenkins console output, if you are interested in viewing the log messages to determine how well the build jobs are progressing.

In some cases, builds may fail on x or z platforms due to network connectivity issues or code changes specific to the platform, in such cases, developer can post below comments to trigger the particular failed build:
    
    ```
      reverify-z - to restart the build on sdk-node-verify s390x platform.
      reverify-x - to restart the build on sdk-node-verify x86_64 platform.
      remerge-z - to restart the build on sdk-node-verify s390x platform.
      remerge-x - to restart the build on sdk-node-verify x86_64 platform.
    ```
#### Where to see the output of the stages?

Piepline supports two views (stages and blueocean). Staged views shows on the Jenkins job main page and it shows each stage in order and the status. For better view, we suggest you to access the BlueOcean plugin. Click on the JOB Number and click on the **Open Blue Ocean** link that shows the build stages in pipeline view. Also, we capture the `.logs files` and keep them on the Job console.

#### How to add more stages to this pipeline flow?

We use scripted pipeline syntax with groovy and shell scripts. Also, we use global shared library scripts which are placed in https://github.com/hyperledger/ci-management/tree/master/vars. Try to leverage the common functions in your code. All you have to do is, undestand the pipeline flow of the tests, add one more stage as mentioned in the existing Jenkinsfile.

#### Build Scripts

Multiple build scripts are used in fabric-ca CI flow. We use global shared library scripts and Jenkinsfile. 

Global Shared Library - https://github.com/hyperledger/ci-management/tree/master/vars

Jenkinsfile           - https://github.com/hyperledger/fabric-sdk-node/tree/release-1.4/Jenkinsfile

ci.properties         - https://github.com/hyperledger/fabric-ca/tree/release-1.4/ci.properties
(ci.properties is the only file you have to modify with the values requried for the specific branch.)

Packer Scripts        - https://github.com/hyperledger/ci-management/blob/master/packer/provision/docker.sh
(Packer is a tool for automatically creating VM and container images, configuring them and post-processing them into standard output formats. We build Hyperledger's CI images via Packer and attach them to x86_64 build nodes. On s390x, we install manually. See the packages we install as a pre-requisite in the CI x86 build nodes.)