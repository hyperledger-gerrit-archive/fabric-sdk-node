#!/usr/bin/env bash

export FABRIC_CFG_PATH=$PWD
configtxgen -profile TwoOrgsOrdererGenesis -outputBlock ./twoorgs.genesis.block
configtxgen -profile TwoOrgsChannel -outputCreateChannelTx ./mychannel.tx -channelID mychannel
