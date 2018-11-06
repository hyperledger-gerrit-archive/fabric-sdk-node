#!/bin/bash -e
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#

# exit on first error

export BASE_FOLDER=$WORKSPACE/gopath/src/github.com/hyperledger
# Modify this when change the image tag
export NEXUS_URL=nexus3.hyperledger.org:10001
export ORG_NAME="hyperledger/fabric"

# error check
err_Check() {
echo "ERROR !!!! --------> $1 <---------"
exit 1
}

Parse_Arguments() {
      while [ $# -gt 0 ]; do
              case $1 in
                      --env_Info)
                            env_Info
                            ;;
                      --pull_Docker_Images)
                            pull_Docker_Images
                            ;;
                      --clean_Environment)
                            clean_Environment
                            ;;
                      --sdk_E2e_Tests)
                            sdk_E2e_Tests
                            ;;
                      --pull_Thirdparty_Images)
                            pull_Thirdparty_Images
                            ;;
                      --publish_NpmModules)
                            publish_NpmModules
                            ;;
                      --publish_ApiDocs)
                            publish_ApiDocs
                            ;;
              esac
              shift
      done
}

clean_Environment() {

echo "-----------> Clean Docker Containers & Images, unused/lefover build artifacts"
function clearContainers () {
        CONTAINER_IDS=$(docker ps -aq)
        if [ -z "$CONTAINER_IDS" ] || [ "$CONTAINER_IDS" = " " ]; then
                echo "---- No containers available for deletion ----"
        else
                docker rm -f $CONTAINER_IDS || true
                docker ps -a
        fi
}

function removeUnwantedImages() {
        DOCKER_IMAGES_SNAPSHOTS=$(docker images | grep snapshot | grep -v grep | awk '{print $1":" $2}')

        if [ -z "$DOCKER_IMAGES_SNAPSHOTS" ] || [ "$DOCKER_IMAGES_SNAPSHOTS" = " " ]; then
                echo "---- No snapshot images available for deletion ----"
        else
                docker rmi -f $DOCKER_IMAGES_SNAPSHOTS || true
        fi
        DOCKER_IMAGE_IDS=$(docker images | grep -v 'base*\|couchdb\|kafka\|zookeeper\|cello' | awk '{print $3}')

        if [ -z "$DOCKER_IMAGE_IDS" ] || [ "$DOCKER_IMAGE_IDS" = " " ]; then
                echo "---- No images available for deletion ----"
        else
                docker rmi -f $DOCKER_IMAGE_IDS || true
                docker images
        fi
}

# Delete nvm prefix & then delete nvm
rm -rf $HOME/.nvm/ $HOME/.node-gyp/ $HOME/.npm/ $HOME/.npmrc  || true

mkdir $HOME/.nvm || true

# remove tmp/hfc and hfc-key-store data
rm -rf /home/jenkins/.nvm /home/jenkins/npm /tmp/fabric-shim /tmp/hfc* /tmp/npm* /home/jenkins/kvsTemp /home/jenkins/.hfc-key-store

rm -rf /var/hyperledger/*

rm -rf gopath/src/github.com/hyperledger/fabric-ca/vendor/github.com/cloudflare/cfssl/vendor/github.com/cloudflare/cfssl_trust/ca-bundle || true
# yamllint disable-line rule:line-length
rm -rf gopath/src/github.com/hyperledger/fabric-ca/vendor/github.com/cloudflare/cfssl/vendor/github.com/cloudflare/cfssl_trust/intermediate_ca || true

clearContainers
removeUnwantedImages
}

env_Info() {
        # This function prints system info

        #### Build Env INFO
        echo "-----------> Build Env INFO"
        # Output all information about the Jenkins environment
        uname -a
        cat /etc/*-release
        env
        gcc --version
        docker version
        docker info
        docker-compose version
        pgrep -a docker
}

# Pull Thirdparty Docker images (couchdb)
pull_Thirdparty_Images() {
            echo "--------> BASE_IMAGE_TAG:" ${BASE_IMAGE_TAG}
            for IMAGES in couchdb; do
                 echo "-----------> Pull $IMAGES image"
                 echo
                 docker pull $ORG_NAME-$IMAGES:${BASE_IMAGE_TAG} > /dev/null 2>&1
                 if [ $? -ne 0 ]; then
                       echo -e "\033[31m FAILED to pull docker images" "\033[0m"
                       exit 1
                 fi
                 docker tag $ORG_NAME-$IMAGES:${BASE_IMAGE_TAG} $ORG_NAME-$IMAGES
            done
                 echo
                 docker images | grep hyperledger/fabric
}
# pull fabric, fabric-ca, javaenv images from nexus
pull_Docker_Images() {
            for IMAGE in peer orderer ca javaenv; do
				if [ $IMAGE == "javaenv" ]; then
					if [ $ARCH == "s390x" ]; then
						# Do not pull javaenv if OS_VER == s390x
						echo "-----------> skipping pull of javaenv image on s390"
					else
						# Pull javaenv at same level as node SDK
						echo "-----------> pull $ORG_NAME-$IMAGE:${ARCH}-${VERSION} image"
						echo
						docker pull $NEXUS_URL/$ORG_NAME-$IMAGE:${ARCH}-${VERSION} > /dev/null 2>&1
						if [ $? -ne 0 ]; then
							echo -e "\033[31m FAILED to pull docker images" "\033[0m"
							exit 1
						fi
						docker tag $NEXUS_URL/$ORG_NAME-$IMAGE:${ARCH}-${VERSION} $ORG_NAME-$IMAGE
						docker tag $NEXUS_URL/$ORG_NAME-$IMAGE:${ARCH}-${VERSION} $ORG_NAME-$IMAGE:${ARCH}-${VERSION}
						docker rmi -f $NEXUS_URL/$ORG_NAME-$IMAGE:${ARCH}-${VERSION}
					fi
				else
					echo "-----------> pull $IMAGE image"
					echo
					docker pull $NEXUS_URL/$ORG_NAME-$IMAGE:${IMAGE_TAG} > /dev/null 2>&1
					if [ $? -ne 0 ]; then
						echo -e "\033[31m FAILED to pull docker images" "\033[0m"
						exit 1
					fi
					docker tag $NEXUS_URL/$ORG_NAME-$IMAGE:${IMAGE_TAG} $ORG_NAME-$IMAGE
					docker tag $NEXUS_URL/$ORG_NAME-$IMAGE:${IMAGE_TAG} $ORG_NAME-$IMAGE:${ARCH}-${VERSION}
					docker rmi -f $NEXUS_URL/$ORG_NAME-$IMAGE:${IMAGE_TAG}
                fi
            done
                 echo
                 docker images | grep hyperledger/fabric
}

# run sdk e2e tests
sdk_E2e_Tests() {
        echo
        echo "-----------> Execute NODE SDK Integration Tests"
        cd ${WORKSPACE}/gopath/src/github.com/hyperledger/fabric-sdk-node || exit
        # Install nvm to install multi node versions
        wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash
        # shellcheck source=/dev/null
        export NVM_DIR="$HOME/.nvm"
        # shellcheck source=/dev/null
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm

        echo "------> Install NodeJS"
        nvm install $NODE_VER || true
        nvm use --delete-prefix v$NODE_VER --silent

        echo "npm version ------> $(npm -v)"
        echo "node version ------> $(node -v)"

        npm install || err_Check "ERROR!!! npm install failed"
        npm config set prefix ~/npm && npm install -g gulp && npm install -g istanbul
        ~/npm/bin/gulp || err_Check "ERROR!!! gulp failed"
        ~/npm/bin/gulp ca || err_Check "ERROR!!! gulp ca failed"
        rm -rf node_modules && npm install || err_Check "ERROR!!! npm install failed"

        echo "------> Run Node SDK Unit, FV, and scenario tests"
        echo "============"
        ~/npm/bin/gulp test
        if [ $? == 0 ]; then
           # Copy Debug log to $WORKSPACE
           cp /tmp/hfc/test-log/*.log $WORKSPACE
        else
           # Copy Debug log to $WORKSPACE
           cp /tmp/hfc/test-log/*.log $WORKSPACE
           exit 1
        fi
}
# Publish npm modules after successful merge on amd64
publish_NpmModules() {
        echo
        echo "-----------> Publish npm modules from amd64"
        ./Publish_NPM_Modules.sh
}

# Publish NODE_SDK API docs after successful merge on amd64
publish_ApiDocs() {
        echo
        echo "-----------> Publish NODE_SDK API docs after successful merge on amd64"
        ./Publish_API_Docs.sh
}
Parse_Arguments $@
