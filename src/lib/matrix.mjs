// The content engine: image-prompt matrix + marketing-copy matrix.
// Every axis multiplies, so repeats are mathematically improbable and are
// additionally blocked by data/history.json.

export const VEHICLES = [
  'modern midsize sedan', 'compact crossover SUV', 'full-size family SUV',
  'crew-cab pickup truck', 'sleek luxury coupe', 'family minivan',
  'sporty hatchback', 'executive sedan'
];

export const COLORS = [
  'gloss black', 'pearl white', 'metallic silver', 'deep navy blue',
  'charcoal gray', 'candy red', 'dark forest green', 'champagne beige'
];

export const SETTINGS = [
  'inside a bright modern wash bay, wet polished concrete floor, water reflections',
  'on a clean suburban driveway with green trees blurred in the background',
  'in a professional detailing garage with soft LED strip lighting on the walls',
  'in an empty asphalt lot with a clean open sky behind',
  'under a covered wash canopy, soft shade, glossy wet ground',
  'on a spotless showroom-style floor with subtle reflections'
];

export const LIGHTING = [
  'soft overcast daylight, even and clean',
  'warm golden hour sunlight with long soft highlights',
  'cool blue hour ambient light with crisp specular highlights',
  'bright studio softbox lighting, professional product look',
  'crisp midday sun with sharp clean reflections on the paint'
];

export const ANGLES = [
  'low three-quarter front angle, 35mm lens, shallow depth of field',
  'tight close-up detail shot, 85mm macro lens, creamy bokeh',
  'clean side profile, 50mm lens, centered composition',
  'elevated three-quarter rear angle, 24mm lens, wide dramatic framing'
];

// What is physically happening in frame, per service.
export const SERVICE_SCENES = {
  exterior: [
    'gloved hands washing the door panel with a plush microfiber wash mitt, thick white foam sliding down the paint, water droplets suspended in the air',
    'a hand rinsing thick foam off the hood with a pressure washer, clean water sheeting off flawless paint',
    'a detailer hand-drying the roof with a large soft microfiber towel, mirror-like reflection in the paint',
    'a close-up of a hand cleaning an alloy wheel with a soft brush, foam on the rim, tire glistening'
  ],
  interior: [
    'photographed from inside the car cabin: a detailer vacuuming a spotless fabric seat with a professional extractor nozzle, seats and centre console clearly visible',
    'interior cabin view: gloved hands wiping the dashboard and air vents with a microfiber cloth, steering wheel and console in frame',
    'inside the footwell: clean floor carpets being brushed, fresh fibers, pedals and door sill visible',
    'the full car interior seen through the open front door: immaculate seats, polished trim, clean carpets, sunlight falling on the upholstery'
  ],
  tint: [
    'hands carefully peeling dark old window film off the rear glass with a plastic blade, film curling away cleanly',
    'a close-up of a squeegee removing adhesive residue from car glass, half the glass crystal clear, half still hazy',
    'a detailer steaming old tint film off a side window, clean tools laid out nearby',
    'crystal clear factory-fresh car glass after film removal, sharp reflections, no haze'
  ],
  combo: [
    'a freshly washed car with the driver door open revealing an immaculate clean interior, water beading on the paint',
    'a spotless car photographed after a full detail, gleaming paint and clean glossy tires, clean cabin visible through the windows',
    'a detailer applying tire dressing to a clean glossy tire beside a freshly washed body panel',
    'a fully cleaned car inside and out, doors open, mats out and spotless, professional presentation'
  ],
  super: [
    'a gleaming car in a professional detailing studio with the hood open showing a spotless clean engine bay',
    'steam rising from a steam cleaner being used on car upholstery, deep clean, professional equipment',
    'a showroom-perfect car with deep mirror gloss paint and freshly blackened tires under studio lighting',
    'water beading tightly into perfect spheres on a hydrophobic-treated windshield, macro detail'
  ]
};

const HARD_NEGATIVES =
  'no text, no words, no letters, no numbers, no watermark, no logo, no brand badge, ' +
  'no emblem, no manufacturer marking, no license plate, no readable signage, generic unbranded vehicle';

export function buildImagePrompt(c) {
  return [
    'Clean unbranded commercial automotive photography with absolutely no text anywhere in the frame.',
    `${c.scene}.`,
    `The vehicle is a ${c.color} ${c.vehicle} with smooth blank body panels, no emblem, no badge, no lettering, no license plate.`,
    `Location: ${c.setting}. Nothing in the background carries writing, signage or labels.`,
    `Lighting: ${c.lighting}.`,
    `Camera: ${c.angle}.`,
    'Ultra photorealistic, sharp focus, high detail, clean composition,',
    'premium car care advertising look, editorial quality, 8k.',
    HARD_NEGATIVES + '.'
  ].join(' ');
}

// ---------------------------------------------------------------- copy ----

export const KICKERS = [
  'TEMPLE HILLS, MD', 'HAND WASHED, ALWAYS', '100% BY HAND',
  'PRINCE GEORGE’S COUNTY', 'NO TUNNELS. EVER.', 'ULTRA-FILTERED WATER'
];

export const CTAS = [
  'Book Your Wash', 'Book Today', 'Reserve Your Spot',
  'Come See Us', 'Book Online', 'Drive In Today'
];

export const HEADLINES = {
  exterior: [
    ['Washed by hand.', 'Never by machine.'],
    ['Zero scratches.', 'Every single wash.'],
    ['Spot-free shine,', 'guaranteed.'],
    ['Your paint', 'deserves better.'],
    ['Tunnels scratch.', 'Hands don’t.'],
    ['That deep', 'hand-finished gloss.'],
    ['Filtered water.', 'Flawless finish.'],
    ['Soft mitt.', 'Sharp results.'],
    ['Grit stays', 'off your paint.'],
    ['Look like you', 'just drove it home.']
  ],
  interior: [
    ['Your cabin,', 'brand new again.'],
    ['Every crumb.', 'Every corner.'],
    ['Stains don’t', 'stand a chance.'],
    ['Breathe easier', 'on every drive.'],
    ['Vacuumed deep.', 'Wiped clean.'],
    ['Dust-free dash,', 'fresh carpets.'],
    ['Spilled coffee?', 'We’ve got it.'],
    ['A cabin that', 'smells new.'],
    ['Deep clean,', 'inside out.'],
    ['Kids, pets,', 'road trips — handled.']
  ],
  tint: [
    ['Bubbling tint?', 'We remove it clean.'],
    ['Purple film,', 'gone for good.'],
    ['Back to', 'factory clear.'],
    ['No scratches.', 'No sticky residue.'],
    ['Old film out.', 'Clear glass in.'],
    ['See clearly', 'again.'],
    ['Peeling tint', 'ruins a car.'],
    ['Precision tint', 'removal.'],
    ['Clean glass,', 'zero haze.'],
    ['Fix that', 'faded film.']
  ],
  combo: [
    ['Inside and out.', 'One visit.'],
    ['The full', 'Mody treatment.'],
    ['Everything clean.', 'Everything shining.'],
    ['One stop.', 'Total transformation.'],
    ['Complete care,', 'start to finish.'],
    ['Wash, detail,', 'shine — done.'],
    ['Your whole car,', 'handled.'],
    ['Interior fresh.', 'Exterior gleaming.'],
    ['The combo', 'everyone books.'],
    ['Full clean.', 'Real difference.']
  ],
  super: [
    ['Showroom results,', 'every time.'],
    ['The premium', 'detail experience.'],
    ['Engine bay', 'to tire shine.'],
    ['Steam clean.', 'Odor gone.'],
    ['Water beads.', 'Dirt slides off.'],
    ['Our very', 'best work.'],
    ['Detailed like', 'a dream car.'],
    ['Perfection,', 'by hand.'],
    ['The Super Mody', 'difference.'],
    ['Treat it like', 'it’s new.']
  ]
};

export const SUBLINES = {
  exterior: [
    'Soft microfiber, grit-guard buckets, ultra-filtered water.',
    'High-pressure rinse, hand dry, glass polish, rims in and out.',
    'Paint-safe biodegradable cleaners — tough on grime, gentle on your clear coat.',
    'Every panel touched by hand. Never a harsh automatic tunnel.',
    'Filtered water means no mineral spots when it dries.',
    'Wheels, glass and paint — all finished by hand.'
    ],
  interior: [
    'Deep vacuum for cabin and trunk, dashboard polish, carpet wash.',
    'Steam stain removal for upholstery and spills.',
    'Dust, crumbs and grime pulled out of every seam.',
    'Floor mats washed, vents cleared, trim wiped down.',
    'The seats your family sits in, actually clean.',
    'Interior detailing that resets your daily drive.'
  ],
  tint: [
    'Scratch-free removal with precise tools — glass back to factory condition.',
    'All adhesive residue fully cleaned. No haze, no sticky film.',
    'We remove old, bubbled and purple film safely.',
    'Defroster lines protected during removal.',
    'Specialized tint removal, done right the first time.',
    'Clear glass restored without damaging your rear defroster.'
  ],
  combo: [
    'Full exterior wash plus complete interior detail in a single visit.',
    'Add precise rim detailing and tire shine to finish it off.',
    'Hand wash, hand dry, deep vacuum, dashboard polish — all of it.',
    'The package that covers everything your car needs.',
    'One appointment. Inside and outside handled.',
    'Everything in Exterior and Interior, together.'
  ],
  super: [
    'Engine bay cleaning, steam clean, stain and odor removal.',
    'Hydrophobic glass treatment that repels water and keeps vision clear.',
    'Upholstery perfuming and tire blackening included.',
    'Our full premium showroom experience, top to bottom.',
    'Everything in the Combo, plus the premium finish.',
    'The complete detail for people who care about their car.'
  ]
};

export const PROOF_CHIPS = [
  '100% Hand Washed', 'Zero Scratches', 'Ultra-Filtered Water',
  'Eco & Paint-Safe', '500+ Weekly Shines', 'Mon–Sat 9–5'
];

export const SUNDAY_COPY = [
  { h: ['Closed Sundays.', 'Booked all week.'], s: 'We rest today so your car shines Monday through Saturday, 9 to 5.' },
  { h: ['Sunday reset.', 'Monday shine.'], s: 'Plan your week — we are open Monday through Saturday, 9AM to 5PM.' },
  { h: ['See you', 'tomorrow.'], s: 'Closed Sundays. Every other day, your car gets the hand-wash treatment.' },
  { h: ['Resting today.', 'Shining tomorrow.'], s: 'Mon–Sat, 9AM–5PM in Temple Hills. Last appointment 4:30PM.' }
];

// -------------------------------------------------------------- hashtags --

export const HASHTAGS = {
  local: ['#TempleHillsMD', '#PrinceGeorgesCounty', '#OxonHill', '#CampSprings', '#Suitland', '#MarylandCarWash', '#DMVCarWash', '#PGCounty'],
  core: ['#HandCarWash', '#CarWash', '#AutoDetailing', '#CarDetailing', '#CarCare', '#DetailingLife', '#CleanCar'],
  exterior: ['#ExteriorDetailing', '#PaintCare', '#ScratchFree', '#CarWashDay', '#ShinyCar'],
  interior: ['#InteriorDetailing', '#DeepClean', '#StainRemoval', '#CarInterior', '#FreshCabin'],
  tint: ['#TintRemoval', '#WindowTint', '#AutoGlass', '#ClearGlass', '#TintRepair'],
  combo: ['#FullDetail', '#CarDetail', '#InsideAndOut', '#DetailingService', '#CarCleaning'],
  super: ['#PremiumDetailing', '#ShowroomShine', '#EngineBayDetail', '#SteamClean', '#CeramicLook']
};
