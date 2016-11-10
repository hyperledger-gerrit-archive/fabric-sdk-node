#!/bin/bash
timeout=60
now=$SECONDS
cmd='peer node start'
if test "$SDK_TLS" = '1' ; then
   until test -f /var/hyperledger/production/.membersrvc/tlsca.cert; do
      test "$now" -gt "$timeout" && break
      >&2 echo "tlsca.cert unavailable - sleeping"
      sleep 1
      now=$((now+1))
   done
   docker cp membersrvc:/var/hyperledger/production/.membersrvc/tlsca.cert /var/hyperledger/production/.membersrvc/tlsca.cert
fi
>&2 echo "tlsca.cert available - starting peer"
exec $cmd
