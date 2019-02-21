#!/bin/bash

# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Exit on first error, print all commands.
set -e

Usage() {
	echo ""
	echo "Usage: ./startFabric.sh"
	echo ""
	exit 1
}

Parse_Arguments() {
	while [ $# -gt 0 ]; do
		case $1 in
			--help)
				HELPINFO=true
				;;
		esac
		shift
	done
}

Parse_Arguments $@

if [ "${HELPINFO}" == "true" ]; then
    Usage
fi

FABRIC_START_TIMEOUT=1

# Grab the current directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

DOCKER_FILE="${DIR}"/../fixtures/docker-compose/docker-compose-tls.yaml

docker-compose -f "${DOCKER_FILE}" down
docker-compose -f "${DOCKER_FILE}" up -d

# wait for Hyperledger Fabric to start
# incase of errors when running later commands, issue export FABRIC_START_TIMEOUT=<larger number>
echo "sleeping for ${FABRIC_START_TIMEOUT} seconds to wait for fabric to complete start up"
sleep ${FABRIC_START_TIMEOUT}

# Create the channel
docker exec peer0.org1.example.com peer channel create -o orderer.example.com:7050 -c mychannel -f /etc/hyperledger/configtx/mychannel.tx --tls --cafile /etc/hyperledger/msp/orderer/tls/ca.crt

docker exec peer0.org1.example.com peer channel fetch config -o orderer.example.com:7050 -c mychannel /etc/hyperledger/mychannel.block --tls --cafile /etc/hyperledger/msp/orderer/tls/ca.crt

# Join peer0.org1.example.com to the channel.
docker exec peer0.org1.example.com peer channel join -b /etc/hyperledger/mychannel.block --tls --cafile /etc/hyperledger/msp/orderer/tls/ca.crt

docker exec peer0.org2.example.com peer channel fetch config -o orderer.example.com:7050 -c mychannel /etc/hyperledger/mychannel.block --tls --cafile /etc/hyperledger/msp/orderer/tls/ca.crt

# Join peer0.org2.example.com to the channel.
docker exec peer0.org2.example.com peer channel join -b /etc/hyperledger/mychannel.block --tls --cafile /etc/hyperledger/msp/orderer/tls/ca.crt

${DIR}/runMocha.sh

docker-compose -f "${DOCKER_FILE}" down
