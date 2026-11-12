// Destination catalogue. Coordinates are real latitude / longitude (WGS84, decimal degrees).
// Base prices are per person in GBP and include return flights from London Heathrow;
// priceFrom() adjusts them for other departure airports.

// Airports visitors can fly from. Add or remove entries freely; the first one is the default.
export const DEPARTURES = [
  { id: 'london', name: 'London', country: 'United Kingdom', airport: 'Heathrow (LHR)', lat: 51.47, lon: -0.4543, currency: 'GBP' },
  { id: 'manchester', name: 'Manchester', country: 'United Kingdom', airport: 'Manchester (MAN)', lat: 53.3537, lon: -2.275, currency: 'GBP' },
  { id: 'dublin', name: 'Dublin', country: 'Ireland', airport: 'Dublin (DUB)', lat: 53.4264, lon: -6.2499, currency: 'EUR' },
  { id: 'amsterdam', name: 'Amsterdam', country: 'Netherlands', airport: 'Schiphol (AMS)', lat: 52.3105, lon: 4.7683, currency: 'EUR' },
  { id: 'frankfurt', name: 'Frankfurt', country: 'Germany', airport: 'Frankfurt (FRA)', lat: 50.0379, lon: 8.5622, currency: 'EUR' },
  { id: 'madrid', name: 'Madrid', country: 'Spain', airport: 'Barajas (MAD)', lat: 40.4983, lon: -3.5676, currency: 'EUR' },
  { id: 'toronto', name: 'Toronto', country: 'Canada', airport: 'Pearson (YYZ)', lat: 43.6777, lon: -79.6248, currency: 'CAD' },
  { id: 'losangeles', name: 'Los Angeles', country: 'USA', airport: 'LAX', lat: 33.9416, lon: -118.4085, currency: 'USD' },
  { id: 'johannesburg', name: 'Johannesburg', country: 'South Africa', airport: 'O. R. Tambo (JNB)', lat: -26.1367, lon: 28.2411, currency: 'ZAR' },
  { id: 'mumbai', name: 'Mumbai', country: 'India', airport: 'Chhatrapati Shivaji (BOM)', lat: 19.0896, lon: 72.8656, currency: 'INR' },
  { id: 'singapore', name: 'Singapore', country: 'Singapore', airport: 'Changi (SIN)', lat: 1.3644, lon: 103.9915, currency: 'SGD' },
];

// Kept for compatibility: the airport the base prices were set from.
export const ORIGIN = DEPARTURES[0];

export const DESTINATIONS = [
  {
    id: 'santorini',
    name: 'Santorini',
    country: 'Greece',
    region: 'Cyclades, Aegean Sea',
    lat: 36.4618,
    lon: 25.3753,
    tags: ['Beach', 'Romance'],
    rating: 4.8,
    reviews: 3942,
    price: 899,
    nights: 7,
    board: 'Breakfast',
    badge: 'Deal of the week',
    was: 1049,
    tz: 'Europe/Athens',
    bestTime: 'May – Oct',
    blurb:
      'Watch the sun drop into the caldera from the lanes of Oia, swim off black-sand beaches and taste Assyrtiko wine grown in volcanic soil.',
    highlights: ['Sunset in Oia', 'Caldera boat trip', 'Akrotiri ruins'],
  },
  {
    id: 'bali',
    name: 'Bali',
    country: 'Indonesia',
    region: 'Lesser Sunda Islands',
    lat: -8.5069,
    lon: 115.2625,
    tags: ['Beach', 'Culture'],
    rating: 4.7,
    reviews: 5218,
    price: 1249,
    nights: 10,
    board: 'Breakfast',
    tz: 'Asia/Makassar',
    bestTime: 'Apr – Oct',
    blurb:
      'Walk the rice terraces around Ubud, surf the breaks at Uluwatu and join temple ceremonies scented with frangipani.',
    highlights: ['Tegallalang terraces', 'Uluwatu sunset', 'Sacred Monkey Forest'],
  },
  {
    id: 'newyork',
    name: 'New York',
    country: 'USA',
    region: 'Manhattan, New York State',
    lat: 40.7128,
    lon: -74.006,
    tags: ['City'],
    rating: 4.7,
    reviews: 8105,
    price: 749,
    nights: 5,
    board: 'Room only',
    tz: 'America/New_York',
    bestTime: 'Apr – Jun, Sep – Nov',
    blurb:
      'Skyline views from the Top of the Rock, a long morning at the Met and late dinners in the West Village.',
    highlights: ['Central Park', 'Brooklyn Bridge', 'A Broadway show'],
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    country: 'Japan',
    region: 'Kantō, Honshu',
    lat: 35.6762,
    lon: 139.6503,
    tags: ['City', 'Culture'],
    rating: 4.9,
    reviews: 4377,
    price: 1399,
    nights: 8,
    board: 'Breakfast',
    tz: 'Asia/Tokyo',
    bestTime: 'Mar – May, Oct – Nov',
    blurb:
      'Neon-lit Shinjuku, quiet shrines in Asakusa and tiny sushi counters, all a short train ride from each other.',
    highlights: ['Shibuya Crossing', 'Sensō-ji temple', 'Day trip to Mt Fuji'],
  },
  {
    id: 'dubai',
    name: 'Dubai',
    country: 'UAE',
    region: 'Persian Gulf coast',
    lat: 25.2048,
    lon: 55.2708,
    tags: ['City', 'Beach'],
    rating: 4.6,
    reviews: 6032,
    price: 699,
    was: 849,
    badge: 'Limited offer',
    nights: 5,
    board: 'Half board',
    tz: 'Asia/Dubai',
    bestTime: 'Nov – Mar',
    blurb:
      'Desert dunes at sunset, slow beach days on Jumeirah and the view from the 148th floor of the Burj Khalifa.',
    highlights: ['Burj Khalifa', 'Desert safari', 'Gold Souk'],
  },
  {
    id: 'paris',
    name: 'Paris',
    country: 'France',
    region: 'Île-de-France',
    lat: 48.8566,
    lon: 2.3522,
    tags: ['City', 'Romance'],
    rating: 4.7,
    reviews: 9410,
    price: 349,
    nights: 3,
    board: 'Breakfast',
    tz: 'Europe/Paris',
    bestTime: 'Apr – Jun, Sep – Oct',
    blurb:
      'Croissants on the Left Bank, evenings along the Seine and the Eiffel Tower sparkling for five minutes every hour after dark.',
    highlights: ['The Louvre', 'Montmartre', 'Seine river cruise'],
  },
  {
    id: 'rio',
    name: 'Rio de Janeiro',
    country: 'Brazil',
    region: 'Guanabara Bay',
    lat: -22.9068,
    lon: -43.1729,
    tags: ['Beach', 'Adventure'],
    rating: 4.6,
    reviews: 2881,
    price: 1149,
    nights: 9,
    board: 'Breakfast',
    tz: 'America/Sao_Paulo',
    bestTime: 'Dec – Mar',
    blurb:
      'Ride the cable car up Sugarloaf Mountain, dance samba in Lapa and spend long days on Copacabana and Ipanema.',
    highlights: ['Sugarloaf Mountain', 'Christ the Redeemer', 'Ipanema beach'],
  },
  {
    id: 'maldives',
    name: 'Maldives',
    country: 'Maldives',
    region: 'North Malé Atoll',
    lat: 4.1755,
    lon: 73.5093,
    tags: ['Beach', 'Romance'],
    rating: 4.9,
    reviews: 1764,
    price: 2199,
    was: 2599,
    badge: 'save', // shown as “Save <was − price>” in the visitor's currency
    nights: 7,
    board: 'All inclusive',
    tz: 'Indian/Maldives',
    bestTime: 'Nov – Apr',
    blurb:
      'An overwater villa above a turquoise lagoon, a house reef full of turtles and dinner on a sandbank under the stars.',
    highlights: ['Overwater villa', 'Snorkel the house reef', 'Sandbank dinner'],
  },
  {
    id: 'capetown',
    name: 'Cape Town',
    country: 'South Africa',
    region: 'Western Cape',
    lat: -33.9249,
    lon: 18.4241,
    tags: ['Adventure', 'City'],
    rating: 4.8,
    reviews: 2347,
    price: 1089,
    nights: 9,
    board: 'Breakfast',
    tz: 'Africa/Johannesburg',
    bestTime: 'Oct – Apr',
    blurb:
      'Hike or ride the cableway up Table Mountain, meet the penguins at Boulders Beach and taste your way through the Winelands.',
    highlights: ['Table Mountain', 'Cape Point drive', 'Stellenbosch wineries'],
  },
  {
    id: 'sydney',
    name: 'Sydney',
    country: 'Australia',
    region: 'New South Wales',
    lat: -33.8688,
    lon: 151.2093,
    tags: ['City', 'Beach'],
    rating: 4.7,
    reviews: 3519,
    price: 1649,
    nights: 12,
    board: 'Room only',
    tz: 'Australia/Sydney',
    bestTime: 'Sep – Nov, Mar – May',
    blurb:
      'Harbour ferries to Manly, the coastal walk from Bondi to Coogee and a night at the Opera House.',
    highlights: ['Opera House', 'Bondi to Coogee walk', 'Blue Mountains'],
  },
  {
    id: 'iceland',
    name: 'Reykjavík',
    country: 'Iceland',
    region: 'Capital Region',
    lat: 64.1466,
    lon: -21.9426,
    tags: ['Adventure'],
    rating: 4.8,
    reviews: 2106,
    price: 649,
    nights: 4,
    board: 'Breakfast',
    tz: 'Atlantic/Reykjavik',
    bestTime: 'Sep – Mar for aurora',
    blurb:
      'Chase the northern lights, soak in geothermal lagoons and drive the Golden Circle past geysers and waterfalls.',
    highlights: ['Northern lights tour', 'Blue Lagoon', 'Golden Circle'],
  },
  {
    id: 'machupicchu',
    name: 'Machu Picchu',
    country: 'Peru',
    region: 'Cusco Region, Andes',
    lat: -13.1631,
    lon: -72.545,
    tags: ['Adventure', 'Culture'],
    rating: 4.9,
    reviews: 1532,
    price: 1899,
    nights: 10,
    board: 'Half board',
    tz: 'America/Lima',
    bestTime: 'May – Sep',
    blurb:
      'Trek the Inca Trail to the Sun Gate, explore the cobbled streets of Cusco and ride the train through the Sacred Valley.',
    highlights: ['Inca Trail', 'Cusco old town', 'Sacred Valley rail'],
  },
];

// Filled in from assets/images/credits.json at runtime (photo author + licence).
export const CATEGORIES = ['All', 'Deals', 'Beach', 'City', 'Culture', 'Adventure', 'Romance', 'Saved'];

const R_EARTH_KM = 6371;
export function greatCircleKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Approximate fixed exchange rates from GBP. Update these (or load live rates) before going live.
// `step` sets how prices are rounded: £899, R21 599, ₹1,04,999.
export const CURRENCIES = {
  GBP: { rate: 1, step: 10, locale: 'en-GB' },
  EUR: { rate: 1.17, step: 10, locale: 'en-IE' },
  USD: { rate: 1.33, step: 10, locale: 'en-US' },
  CAD: { rate: 1.84, step: 10, locale: 'en-CA' },
  ZAR: { rate: 24, step: 100, locale: 'en-ZA' },
  INR: { rate: 113, step: 1000, locale: 'en-IN' },
  SGD: { rate: 1.73, step: 10, locale: 'en-SG' },
};

const formatters = {};
export function money(amount, currency = 'GBP') {
  const c = CURRENCIES[currency] || CURRENCIES.GBP;
  formatters[currency] ||= new Intl.NumberFormat(c.locale, { style: 'currency', currency, maximumFractionDigits: 0 });
  return formatters[currency].format(amount);
}

/** Convert a GBP amount; `charm` rounds to the step and ends in 9 (899, 21 599). */
export function convert(gbp, currency = 'GBP', { charm = false } = {}) {
  const c = CURRENCIES[currency] || CURRENCIES.GBP;
  const rounded = Math.round((gbp * c.rate) / c.step) * c.step;
  return charm ? rounded - 1 : rounded;
}

// Estimated fare change for flying from somewhere other than London:
// about £0.05 per extra great-circle km, never below 55% of the base package.
// Returns the package price in the departure airport's currency.
const FARE_PER_KM = 0.05;
export function priceFrom(amount, dest, origin) {
  if (!amount) return amount;
  const delta = (greatCircleKm(origin, dest) - greatCircleKm(ORIGIN, dest)) * FARE_PER_KM;
  const gbp = Math.max(amount * 0.55, amount + delta);
  return convert(gbp, origin.currency, { charm: true });
}

// Rough block time: cruise ~ 850 km/h plus 40 minutes for taxi, climb and descent.
export function flightMinutes(km) {
  return Math.round((km / 850) * 60 + 40);
}
