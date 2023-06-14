

export const CodeSnippet = () => {
  const codeString = `{
    "uid": 1,
    "firstName": "Terry",
    "lastName": "Medhurst",
    "email": "atuny0@sohu.com",
    "phone": "+63 791 675 8914",
    "username": "atuny0",
    "birthDate": "2000-12-25",
    "image": "https://robohash.org/hicveldicta.png?size=50x50&set=set1",
    "domain": "slashdot.org",
    "ip": "117.29.86.254",
    "address": {
      "address": "1745 T Street Southeast",
      "city": "Washington",
      "coordinates": {
        "lat": 38.867033,
        "lng": -76.979235
      },
      "postalCode": "20020",
      "state": "DC"
    },
    "macAddress": "13:69:BA:56:A3:74",
   
    "ein": "20-9487066",
    "ssn": "661-64-2976",
    "userAgent": "Mozilla/5.0 ..."
  }`;
  return (
    <div>
      {codeString}
    </div>
  );
};
