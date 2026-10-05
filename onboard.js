const axios = require('axios');

axios.post('https://nibssbyphoenix.onrender.com/api/fintech/onboard', {
  name: 'FUN BANK',       // pick a name for your bank
  email: 'fortuneval2@gmail.com',   // your real email
})
.then((res) => {
  console.log('Onboarding response:', res.data);
})
.catch((err) => {
  console.error('Onboarding failed:', err.response ? err.response.data : err.message);
});