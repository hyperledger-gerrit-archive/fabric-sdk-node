#!/bin/bash -e
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#

# exit on first error

echo
echo "------> START NODE TESTS"

cd ${WORKSPACE}/gopath/src/github.com/hyperledger/fabric-sdk-node/test/fixtures || exit
docker-compose up >> dockerlogfile.log 2>&1 &
sleep 30
echo "---------> LIST DOCKER CONTAINERS"
docker ps -a

cd ${WORKSPACE}/gopath/src/github.com/hyperledger/fabric-sdk-node || exit

# Install nvm to install multi node versions
wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.2/install.sh | bash
# shellcheck source=/dev/null
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm

echo "------> Install NodeJS"
# This also depends on the fabric-baseimage. Makesure you modify there as well.
NODE_VER=8.9.4
echo "------> Use $NODE_VER for master and release-1.1 branches"
nvm install $NODE_VER || true
# use nodejs 8.9.4 version
nvm use --delete-prefix v$NODE_VER --silent

echo "npm version ------> $(npm -v)"
echo "node version ------> $(node -v)"

npm install || err_Check "ERROR!!! npm install failed"
npm config set prefix ~/npm && npm install -g gulp && npm install -g istanbul
gulp || err_Check "ERROR!!! gulp failed"
gulp ca || err_Check "ERROR!!! gulp ca failed"
rm -rf node_modules/fabric-ca-client && npm install || err_Check "ERROR!!! npm install failed"

echo "------> Run node headless & e2e tests"
gulp test

# copy debug log file to $WORKSPACE directory
if [ $? == 0 ]; then

       # Copy Debug log to $WORKSPACE
       cp /tmp/hfc/test-log/*.log $WORKSPACE
else
       # Copy Debug log to $WORKSPACE
       cp /tmp/hfc/test-log/*.log $WORKSPACE
       exit 1

fi
