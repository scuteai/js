import base64url from "./base64url-arraybuffer";

const publicKeyCredentialToJSON = (pubKeyCred) => {
  if (pubKeyCred instanceof Array) {
    let arr = [];
    for (let i of pubKeyCred) arr.push(publicKeyCredentialToJSON(i));

    return arr;
  } else if (pubKeyCred instanceof ArrayBuffer) {
    return base64url.encode(pubKeyCred);
  } else if (pubKeyCred instanceof Object) {
    let obj = {};

    for (let key in pubKeyCred) {
      obj[key] = publicKeyCredentialToJSON(pubKeyCred[key]);
    }

    return obj;
  }
  // pubKeyCred.attestation = 'none';
  return pubKeyCred;
};

const generateRandomBuffer = (len) => {
  len = len || 32;

  const randomBuffer = new Uint8Array(len);
  window.crypto.getRandomValues(randomBuffer);

  return randomBuffer;
};

const preformatMakeCredReq = (makeCredReq) => {
  makeCredReq.challenge = base64url.decode(makeCredReq.challenge);
  makeCredReq.user.id = base64url.decode(makeCredReq.user.id);
  makeCredReq.allowCredentials = [
    {
      id: "credentialsIdentifierOne", // Windows Hello
      type: "public-key",
      transports: ["internal"],
    },
    {
      id: "credentialsIdentifierTwo", // iOS FaceID
      type: "public-key",
      transports: ["internal"],
    },
  ];
  // makeCredReq.excludeCredentials = [{
  //   type: 'public-key',
  //   id: Uint8Array([4, 3, ... 2, 1]),
  //   transports: ['USB', 'NFC', 'BLE', 'internal']
  // }]
  makeCredReq.pubKeyCredParams = [{ type: "public-key", alg: -7 }];
  makeCredReq.timeout = 60000;
  // makeCredReq.attestationType = 'none'
  // makeCredReq.attestation = 'none'
  makeCredReq.authenticatorSelection = {
    userVerification: "required",
    authenticatorAttachment: "platform",
    requireResidentKey: true,
  };
  return makeCredReq;
};

const preformatGetAssertReq = (getAssert) => {
  getAssert.challenge = base64url.decode(getAssert.challenge);

  for (let allowCred of getAssert.allowCredentials) {
    allowCred.id = base64url.decode(allowCred.id);
  }

  return getAssert;
};

export {
  publicKeyCredentialToJSON,
  generateRandomBuffer,
  preformatGetAssertReq,
  preformatMakeCredReq,
};
