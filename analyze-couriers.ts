import axios from 'axios';

async function analyzeCouriers() {
  try {
    const response = await axios.get('http://localhost:5000/api/orders/559c9b54-64e4-4517-a0b4-c68f224afeb6/couriers');
    const couriers = response.data.couriers;
    
    console.log('\n========== DETAILED COURIER ANALYSIS ==========\n');
    console.log(`Total couriers: ${couriers.length}\n`);
    
    // Group by serviceability from our app
    const serviceable = couriers.filter((c: any) => c.is_serviceable);
    const nonServiceable = couriers.filter((c: any) => !c.is_serviceable);
    
    console.log('=== COURIERS SHOWN AS SERVICEABLE BY OUR APP ===');
    serviceable.forEach((c: any) => {
      console.log(`\n${c.courier_name}`);
      console.log(`  ID: ${c.courier_company_id}`);
      console.log(`  Type: ${c.is_surface ? 'Surface' : 'Air'}`);
      console.log(`  Price (rate): ₹${c.rate}`);
      console.log(`  Rating: ${c.rating}`);
      console.log(`  blocked: ${c.blocked}`);
      console.log(`  block_cod: ${c.block_cod}`);
      console.log(`  qc_courier: ${c.qc_courier}`);
      console.log(`  suppress_text: "${c.suppress_text}"`);
      console.log(`  suppression_dates:`, c.suppression_dates);
      console.log(`  Warning: ${c.has_warning ? c.warning_message : 'None'}`);
    });
    
    console.log('\n\n=== COURIERS SHOWN AS NON-SERVICEABLE BY OUR APP ===');
    nonServiceable.forEach((c: any) => {
      console.log(`\n${c.courier_name}`);
      console.log(`  ID: ${c.courier_company_id}`);
      console.log(`  Type: ${c.is_surface ? 'Surface' : 'Air'}`);
      console.log(`  Price (rate): ₹${c.rate}`);
      console.log(`  Rating: ${c.rating}`);
      console.log(`  blocked: ${c.blocked}`);
      console.log(`  block_cod: ${c.block_cod}`);
      console.log(`  qc_courier: ${c.qc_courier}`);
      console.log(`  suppress_text: "${c.suppress_text}"`);
      console.log(`  suppression_dates:`, c.suppression_dates);
      console.log(`  Reason: ${c.non_serviceable_reason}`);
    });
    
    console.log('\n\n=== SHIPROCKET EXPECTED (from screenshots) ===');
    console.log('Serviceable Air (2): DTDC Air 500gm, Ekart Logistics Air');
    console.log('Serviceable Surface (4): Shadowfax Surface, Amazon Shipping Surface 2kg, Ekart Logistics Surface, DTDC Surface_Network Stress');
    console.log('Non-Serviceable: DTDC Surface, Shadowfax Surface_Network Stress');
    
  } catch (error) {
    console.error('Analysis failed:', error);
  }
}

analyzeCouriers();
