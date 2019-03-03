#!/bin/bash -e
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#

npmPublish() {
  if [[ "$CURRENT_TAG" = *"unstable"* ]] || [[ "$CURRENT_TAG" = *"skip"* ]]; then
      echo
      UNSTABLE_VER=$(npm dist-tags ls "$1" | awk '/$CURRENT_TAG/{
      ver=$NF
      sub(/.*\./,"",rel)
      sub(/\.[[:digit:]]+$/,"",ver)
      print ver}')

      echo "===> UNSTABLE VERSION --> $UNSTABLE_VER"

      UNSTABLE_INCREMENT=$(npm dist-tags ls "$1" | awk '/$CURRENT_TAG/{
      ver=$NF
      rel=$NF
      sub(/.*\./,"",rel)
      sub(/\.[[:digit:]]+$/,"",ver)
      print ver"."rel+1}')

      echo "===> Incremented UNSTABLE VERSION --> $UNSTABLE_INCREMENT

      # Get last digit of the unstable version of $CURRENT_TAG
      UNSTABLE_INCREMENT=$(echo $UNSTABLE_INCREMENT| rev | cut -d '.' -f 1 | rev)
      echo "--------> UNSTABLE_INCREMENT : $UNSTABLE_INCREMENT""

      # Append last digit with the package.json version
      export UNSTABLE_INCREMENT_VERSION=$RELEASE_VERSION.$UNSTABLE_INCREMENT
      echo "--------> UNSTABLE_INCREMENT_VERSION" $UNSTABLE_INCREMENT_VERSION

      # Replace existing version with $UNSTABLE_INCREMENT_VERSION
      sed -i 's/\(.*\"version\"\: \"\)\(.*\)/\1'$UNSTABLE_INCREMENT_VERSION\"\,'/' package.json
      npm publish --tag $CURRENT_TAG

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

  # Get the unstable tag from package.json
  CURRENT_TAG=$(cat package.json | grep tag | awk -F\" '{ print $4 }')
  echo "===> Current TAG --> $CURRENT_TAG"

  # Get the version from package.json
  RELEASE_VERSION=$(cat package.json | grep version | awk -F\" '{ print $4 }')
  echo "===> Current Version --> $RELEASE_VERSION"

}

ARCH=$(uname -m)
echo "----------> ARCH" $ARCH

for modules in fabric-ca-client fabric-client; do
     if [ -d "$modules" ]; then
           echo -e "\033[32m Publishing $modules" "\033[0m"
           cd $modules
           versions
          npmPublish $modules
          cd -
     fi
done
