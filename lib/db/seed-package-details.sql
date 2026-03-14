UPDATE packages SET details = '{
  "airline": "Akasa Air / Air India Express",
  "departureCities": ["Mumbai", "Delhi", "Hyderabad", "Lucknow"],
  "hotelMakkah": "Jabal Omar Marriott",
  "hotelMadinah": "Shaza Al Madina",
  "hotelCategoryMakkah": "5 Star",
  "hotelCategoryMadinah": "5 Star",
  "distanceMakkah": "150 meters",
  "distanceMadinah": "100 meters",
  "roomType": "Quad Sharing",
  "mealPlan": "Breakfast + Dinner (Indian Menu)",
  "transport": "AC Deluxe Bus",
  "visa": "Umrah Visa Included"
}'::jsonb
WHERE name = 'Ramadan Umrah Full Month Package' AND type = 'ramadan_umrah';

UPDATE packages SET details = '{
  "airline": "Akasa Air",
  "departureCities": ["Mumbai", "Delhi"],
  "hotelMakkah": "Hilton Suites Makkah",
  "hotelMadinah": "Crowne Plaza Madinah",
  "hotelCategoryMakkah": "5 Star",
  "hotelCategoryMadinah": "5 Star",
  "distanceMakkah": "200 meters",
  "distanceMadinah": "150 meters",
  "roomType": "Quad Sharing",
  "mealPlan": "Breakfast + Dinner (Indian Menu)",
  "transport": "AC Deluxe Bus",
  "visa": "Umrah Visa Included"
}'::jsonb
WHERE name = 'Ramadan Umrah Special – Last 20 Days' AND type = 'ramadan_umrah';

UPDATE packages SET details = '{
  "airline": "Saudi Airlines Direct",
  "departureCities": ["Mumbai", "Delhi", "Hyderabad", "Lucknow", "Jaipur"],
  "hotelMakkah": "Pullman ZamZam Makkah",
  "hotelMadinah": "The Oberoi Madinah",
  "hotelCategoryMakkah": "5 Star Deluxe",
  "hotelCategoryMadinah": "5 Star Deluxe",
  "distanceMakkah": "50 meters (Haram View)",
  "distanceMadinah": "100 meters",
  "roomType": "Double Sharing",
  "mealPlan": "Full Board (Breakfast, Lunch, Dinner)",
  "transport": "Private AC Vehicle",
  "visa": "Hajj Visa Included"
}'::jsonb
WHERE name = 'Burhan Royal Elite – Hajj 2027' AND type = 'hajj';
