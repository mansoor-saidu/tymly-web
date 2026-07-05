const url = process.env.VITE_SUPABASE_URL + '/rest/v1/';
const headers = {
  'apikey': process.env.VITE_SUPABASE_ANON_KEY,
  'Authorization': 'Bearer ' + process.env.VITE_SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function fix() {
  const usersRes = await fetch(url + 'admin_users?email=eq.mansaidus@gmail.com&select=*', { headers });
  const users = await usersRes.json();
  if (!users || users.length === 0) {
    console.error("No user found!");
    return;
  }
  const user = users[0];
  console.log("Found user:", user.email);

  if (!user.company_id) {
    console.log("User missing company_id, creating company...");
    const compRes = await fetch(url + 'companies', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: user.business_name || 'Tymly Corp' })
    });
    const comps = await compRes.json();
    if (!comps || comps.length === 0) { console.error("Company error:", comps); return; }
    const company = comps[0];
    console.log("Created company:", company.id);
    
    // Update user
    await fetch(url + 'admin_users?id=eq.' + user.id, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ company_id: company.id })
    });
    user.company_id = company.id;
  }

  // Check system settings
  const settRes = await fetch(url + 'system_settings?company_id=eq.' + user.company_id + '&select=*', { headers });
  const settings = await settRes.json();
  
  if (!settings || settings.length === 0) {
    console.log("Creating system settings...");
    const insRes = await fetch(url + 'system_settings', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        company_id: user.company_id,
        office_latitude: 37.7749,
        office_longitude: -122.4194,
        office_radius_meters: 100,
        work_start_time: '09:00:00',
        late_grace_period_minutes: 15
      })
    });
    const insData = await insRes.json();
    if (!insRes.ok) console.error("Insert settings error:", insData);
    else console.log("System settings created successfully!");
  } else {
    console.log("System settings already exist!");
  }
}
fix();
