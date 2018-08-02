#!/bin/bash -e
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#

npmPublish() {
  if [ $RELEASE = "snapshot" ]; then
      echo
      UNSTABLE_VER=$(npm dist-tags ls "$1" | awk '/unstable/{
      ver=$NF
      sub(/.*\./,"",rel)
      sub(/\.[[:digit:]]+$/,"",ver)
      print ver}')

      echo "===> UNSTABLE VERSION --> $UNSTABLE_VER"

      UNSTABLE_INCREMENT=$(npm dist-tags ls "$1" | awk '/unstable/{
      ver=$NF
      rel=$NF
      sub(/.*\./,"",rel)
      sub(/\.[[:digit:]]+$/,"",ver)
      print ver"."rel+1}')

      echo "===> Incremented UNSTABLE VERSION --> $UNSTABLE_INCREMENT"

      if [ "$UNSTABLE_VER" = "$CURRENT_RELEASE" ]; then
          # Replace existing version with Incremented $UNSTABLE_VERSION
          sed -i 's/\(.*\"version\"\: \"\)\(.*\)/\1'$UNSTABLE_INCREMENT\"\,'/' package.json
          echo "TEST CHANGE -- NOT PUBLISHING"
          # npm publish --tag unstable
      else
          # Replace existing version with $CURRENT_RELEASE
          sed -i 's/\(.*\"version\"\: \"\)\(.*\)/\1'$CURRENT_RELEASE\"\,'/' package.json
          echo "TEST CHANGE -- NOT PUBLISHING"
          # npm publish --tag unstable
      fi
  else
      if [[ "$RELEASE" =~ alpha*|preview*|beta*|rc*|^[0-9].[0-9].[0-9]$ ]]; then
          echo "----> Publish $RELEASE from fabric-sdk-node-npm-release-x86_64 job"
      fi
  fi
}

##########################
#
# Fetch release version
#
##########################

versions() {

  CURRENT_RELEASE=$(cat package.json | grep version | awk -F\" '{ print $4 }')
  echo "===> Current Version --> $CURRENT_RELEASE"
  RELEASE=$(cat package.json | grep version | awk -F\" '{ print $4 }' | cut -d "-" -f 2)
  echo "===> Current Release --> $RELEASE"
}

# Publish unstable npm modules from amd64 ARCH
cd $WORKSPACE/gopath/src/github.com/hyperledger/fabric-sdk-node
# Set NVM and NPM here
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm
nvm use --delete-prefix 8.9.4 --silent
npm config set //registry.npmjs.org/:_authToken=$NPM_TOKEN

# publish fabric-ca-client node module
cd fabric-ca-client
versions
npmPublish fabric-ca-client

# publish fabric-client node module
cd ../fabric-client
versions
npmPublish fabric-client

