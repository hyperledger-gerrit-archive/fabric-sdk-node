#
# SPDX-License-Identifier: Apache-2.0
#

@admin_api
Feature: Use admin API to perform admin operations

Background:
    Given I place a scenario start message ADMINQUERY API FEATURE
    Given I deploy a tls Fabric network
    And I use the cli to create and join the channel named baseapichannel on the deployed network
    And I use the cli to deploy a node smart contract named fabcar at version 1.0.0 for all organizations on channel baseapichannel with endorsement policy 1of and arguments ["initLedger"]

Scenario: Using only fabric-admin I can query the netwoork
    Given I have created a client named leon based on information in profile ccp-tls under organization Org1
    Then I should be able to query peer peer0.org1.example.com to see the channels for client leon
