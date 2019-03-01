#
# SPDX-License-Identifier: Apache-2.0
#

echo 'Deleting old *.tx items....'
rm -rf ../crypto-config
rm -rf ../channel-config
mkdir ../channel-config

echo 'Generating base crypto-material and channel tx files....'
export FABRIC_CFG_PATH=$PWD
cryptogen generate --config=./crypto-config.yaml --output=../crypto-config
configtxgen -profile TwoOrgsOrdererGenesis -outputBlock ./twoorgs.genesis.block
configtxgen -profile TwoOrgsChannel -outputCreateChannelTx ../channel-config/mychannel.tx -channelID mychannel
configtxgen -profile TwoOrgsChannel -outputCreateChannelTx ../channel-config/mychanneltx.tx -channelID mychanneltx
configtxgen -profile TwoOrgsChannel -outputCreateChannelTx ../channel-config/mychannelts.tx -channelID mychannelts
configtxgen -profile TwoOrgsChannel -outputCreateChannelTx ../channel-config/adminconfig.tx -channelID adminconfig
configtxgen -profile TwoOrgsChannel -outputCreateChannelTx ../channel-config/discovery.tx -channelID discovery

echo 'Generating crypto-material complete, now renaming keys...'
# Rename the key files we use to be key.pem instead of a uuid
for KEY in $(find ../crypto-config -type f -name "*_sk"); do
    KEY_DIR=$(dirname ${KEY})
    mv ${KEY} ${KEY_DIR}/key.pem
done
echo 'Renaming keys complete'
