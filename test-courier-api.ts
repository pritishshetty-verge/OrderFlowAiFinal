// Test script to directly call the Shiprocket courier API and log the response
async function testCourierAPI() {
  const orderId = '559c9b54-64e4-4517-a0b4-c68f224afeb6'; // Order #1045
  
  console.log('\n=== Testing Courier API for Order #1045 ===\n');
  
  try {
    const response = await fetch(`http://localhost:5000/api/orders/${orderId}/couriers`);
    
    if (!response.ok) {
      const error = await response.json();
      console.error('API Error:', error);
      return;
    }
    
    const data = await response.json();
    console.log('\nFrontend receives:', JSON.stringify(data, null, 2));
    console.log(`\nTotal couriers returned: ${data.couriers?.length || 0}`);
    
    // Group by serviceability and type
    const serviceable = data.couriers?.filter((c: any) => c.is_serviceable) || [];
    const nonServiceable = data.couriers?.filter((c: any) => !c.is_serviceable) || [];
    const air = serviceable.filter((c: any) => !c.is_surface);
    const surface = serviceable.filter((c: any) => c.is_surface);
    
    console.log(`\nServiceable: ${serviceable.length} (Air: ${air.length}, Surface: ${surface.length})`);
    console.log(`Non-serviceable: ${nonServiceable.length}`);
    
    console.log('\n=== Serviceable Couriers ===');
    serviceable.forEach((c: any) => {
      const price = c.total_charge || c.rate || 0;
      console.log(`${c.courier_name.padEnd(35)} | ₹${price.toFixed(2).padStart(8)} | Rating: ${c.rating} | ${c.is_surface ? 'Surface' : 'Air'}`);
    });
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testCourierAPI();
