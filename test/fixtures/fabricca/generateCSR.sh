
BASEDIR=$(dirname $(realpath $0))
echo "Generating fabricca cetificates and keys in directory ${BASEDIR}"
openssl req -nodes -newkey rsa:2048 -keyout ${BASEDIR}/test.key -out ${BASEDIR}/test.csr -subj "/C=GB/ST=London/L=London/O=Global Security/OU=IT Department/CN=aTestUser"
openssl req -nodes -newkey rsa:512 -keyout ${BASEDIR}/enroll-key.pem -out ${BASEDIR}/enroll-csr.pem -subj "/C=GB/ST=London/L=London/O=Global Security/OU=IT Department/CN=testUser"
echo "Generation complete"
