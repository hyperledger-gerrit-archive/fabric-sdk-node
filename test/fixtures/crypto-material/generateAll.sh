#/bin/bash
# One generate file to rule them all

BASEDIR=$(dirname $(realpath $0))
${BASEDIR}/config-base/generate.sh
${BASEDIR}/config-update/generate.sh
