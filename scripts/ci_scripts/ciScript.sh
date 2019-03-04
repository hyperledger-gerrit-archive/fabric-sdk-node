#!/bin/bash -e
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#

export CONTAINER_LIST=(orderer peer0.org1 peer0.org2)

# error check
err_Check() {

  echo -e "\033[31m $1" "\033[0m"
  docker images | grep hyperledger && docker ps -a

  # Write orderer, peer logs
  for CONTAINER in ${CONTAINER_LIST[*]}; do
     docker logs $CONTAINER.example.com >& $CONTAINER.log
  done

  # Write ca logs into ca_peerOrg1.log
  docker logs ca_peerOrg1 >& ca_peerOrg1.log
  # Write ca logs into ca_peerOrg2.log
  docker logs ca_peerOrg2 >& ca_peerOrg2.log
  # Write couchdb container logs into couchdb.log file
  docker logs couchdb >& couchdb.log

  # Copy debug log
  cp /tmp/hfc/test-log/*.log $WORKSPACE || true
  exit 1
}

Parse_Arguments() {
  while [ $# -gt 0 ]; do
    case $1 in
      --sdk_E2e_Tests)
      sdk_E2e_Tests
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

# Install npm
install_Npm() {
  echo "-------> MARCH:" $MARCH
  if [[ $MARCH == "s390x" || $MARCH == "ppc64le" ]]; then
    # Source nvmrc.sh
    source /etc/profile.d/nvmrc.sh
    # Delete any existing prefix
    npm config delete prefix
    # Install NODE_VER
    echo "------> Use $NODE_VER"
    nvm install $NODE_VER || true
    nvm use --delete-prefix v$NODE_VER --silent
    npm install || err_Check "ERROR!!! npm install failed"
    npm config set prefix ~/npm && npm install -g gulp && npm install -g istanbul

    echo -e "\033[32m npm version ------> $(npm -v)" "\033[0m"
    echo -e "\033[32m node version ------> $(node -v)" "\033[0m"

  else
    echo -e "\033[32m npm version ------> $(npm -v)" "\033[0m"
    echo -e "\033[32m node version ------> $(node -v)" "\033[0m"

    npm install || err_Check "ERROR!!! npm install failed"
    npm install -g gulp && npm install -g istanbul
  fi
}

# run sdk e2e tests
sdk_E2e_Tests() {

  cd ${WORKSPACE}/gopath/src/github.com/hyperledger/fabric-sdk-node

  # Install npm before start the tests
  install_Npm

  echo -e "\033[32m Execute Headless and Integration Tests" "\033[0m"
  gulp test || err_Check "ERROR!!! gulp test failed"

  echo -e "\033[32m Execute logging test only" "\033[0m"
  gulp test-logging || err_Check "ERROR!!! gulp test failed"

  echo -e "\033[32m Execute cucumber tests" "\033[0m"
  gulp run-test-sceanrio || err_Check "ERROR!!! gulp test failed"
}

# Publish npm modules after successful merge on amd64
publish_NpmModules() {
  echo
  echo -e "\033[32m -----------> Publish npm modules from amd64" "\033[0m"
  ./publish_npm_modules.sh
}

# Publish NODE_SDK API docs after successful merge on amd64
publish_ApiDocs() {
  echo
  echo -e "\033[32m -----------> Publish NODE_SDK API docs after successful merge on amd64" "\033[0m"
  ./publish_api_docs.sh
}
Parse_Arguments $@
