#
# SPDX-License-Identifier: Apache-2.0
#

BASEDIR=$(dirname $(realpath $0))
echo "Creating new channel update tx blocks from within directory ${BASEDIR}"
export FABRIC_CFG_PATH=$BASEDIR
configtxgen -profile TwoOrgsChannel -outputAnchorPeersUpdate ${BASEDIR}/../channel-config/mychannel-org1anchor.tx -channelID mychannel -asOrg Org1MSP
configtxgen -profile TwoOrgsChannel -outputAnchorPeersUpdate ${BASEDIR}/../channel-config/discovery_anchor.tx -channelID discovery -asOrg Org1MSP

