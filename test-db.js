const url = process.env.VITE_SUPABASE_URL + '/rest/v1/companies?select=*&limit=1';
const headers = {
  'apikey': process.env.VITE_SUPABASE_ANON_KEY,
  'Authorization': 'Bearer ' + process.env.VITE_SUPABASE_ANON_KEY
};
fetch(url, { headers })
  .then(res => res.json())
  .then(data => console.log("Companies:", data))
  .catch(err => console.error(err));
