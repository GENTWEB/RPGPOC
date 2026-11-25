const RAW_WORLD_PITCHES = [
  "A rain-soaked underwater noir city where immortal sea creatures hunt each other for memories",
  "Downsizing meets Jason Bourne inside a crumbling, hyper-dense micro-city",
  "A cozy steampunk clockwork village where someone keeps stealing everyone's Tuesdays",
  "The siege of a floating sky-fortress held together by failing 1970s analog computers",
  "A cursed desert caravan crossing a glass sea that whispers the names of the dead",
  "1920s jazz-age Chicago, except every speakeasy hides a portal to a different mythological underworld",
  "A deep-space salvage crew discovers an abandoned luxury liner whose AI still thinks the passengers are alive",
  "Post-apocalyptic botanical jungle where rival courier guilds ride armored beetles between skyscraper canopies",
  "A small Pacific Northwest logging town where the fog erases one building every new moon",
  "Renaissance Venice run by rival alchemist banks who mint memories instead of gold",
  "A Victorian train that never stops circling a frozen continent, with a murder in the dining car",
  "Suburban 1994 summer break where four kids uncover a buried Cold War weather machine",
  "A high-fantasy heist crew hired to steal a dragon's tax ledger from an impenetrable marble vault",
  "Cyberpunk Tokyo rebuilt inside a sunken arcology, where street racers bet years of their lifespan",
  "An isolated lighthouse on a jagged basalt island whose beam reveals ships from the wrong century",
  "A sunlit Mediterranean archipelago of sky-islands connected by brass cable cars and rival mapmakers",
  "Medieval siege warfare where both armies rely on unreliable, temperamental golems",
  "A sleepy Midwestern diner at the intersection of four parallel timelines that only opens at 3:14 AM",
  "Solarpunk orbital ring garden where a quiet saboteur is poisoning the gravity wells",
  "A sprawling subterranean bazaar built inside the ribcage of a petrified leviathan",
  "1950s atomic-age spy thriller set inside an underground desert resort for defecting scientists",
  "A noir detective agency staffed entirely by retired fairy-tale sidekicks trying to pay rent",
  "A monastic library carved into a glacier where forbidden books rewrite the reader's past",
  "Wild West frontier town built around a crashed alien beacon that bends gravity at high noon",
  "A quiet coastal bookstore whose back room opens onto whichever city the customer regrets leaving",
  "Brutalist retro-futuristic megacity where rain falls upward and elevators travel sideways",
  "A pirate republic of lashed-together oil rigs surviving on salvaged tech and black-market fresh water",
  "Ancient Rome if the steam engine had been invented during the reign of Marcus Aurelius",
  "A haunted luxury ski lodge cut off by an avalanche, where every guest has a forged passport",
  "A neon-lit night market on the moon where smugglers trade contraband earth soil and banned music",
  "Feudal Japan during a sudden eclipse that refuses to end, waking dormant mountain spirits",
  "A travelling circus of illusionists who accidentally summon a real god during their finale",
  "A crumbling Art Deco ocean liner trapped in an endless Sargasso Sea of time-lost wrecks",
  "Modern-day London where streetlamps keep shadow-beasts at bay and the power grid is flickering",
  "A gritty space-trucking route through an asteroid belt controlled by competing corporate unions",
  "A pastoral fantasy kingdom where magic is dying and a retired blacksmith holds the last ember",
  "Cold War Berlin with a secret fourth sector accessible only through abandoned U-Bahn tunnels",
  "A towering vertical slum built around a geothermal vent on a tidally locked ice planet",
  "A sunlit archaeological dig in Egypt that uncovers a perfectly preserved 1980s arcade",
  "A gothic boarding school on a cliffside where the honor roll students are slowly turning to marble",
  "An alternate-history 1890s World's Fair where Nikola Tesla's latest demo tears open the sky",
  "A quiet road trip across an empty, sun-bleached American Southwest where every radio station broadcasts tomorrow's news",
];

export function getShuffledPitches() {
  const arr = [...RAW_WORLD_PITCHES];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const DEFAULT_STEP3_EXAMPLES = {
  techLevel: [
    'Analog 1970s cassette-futurism with zero wireless tech',
    'Low-magic gritty medieval where alchemy is illegal and costly',
    'Hard sci-fi with realistic orbital physics and aging salvage gear',
    'Modern-day realism with one hidden supernatural rule',
  ],
  narratorStyle: [
    'Raymond Chandler noir meets Wes Anderson visual symmetry',
    'Andy Weir grounded problem-solving meets Neil Gaiman myth',
    'Cormac McCarthy spare tension with sharp, dry dialogue',
    'Studio Ghibli wonder with a quiet undercurrent of mystery',
  ],
  dateTime: [
    'Late autumn, 1987 - three weeks after the blackout',
    'Year 14 of the Great Reduction, dusk on a Tuesday',
    'High summer, 1492 - eve of the Solstice truce',
    'Present day, 2:40 AM during an unseasonable storm',
  ],
};

export const SETTING_HELP_MODALS = {
  rulesetMode: {
    title: 'Play Style',
    subtitle: 'Controls how outcomes, risk, and tension are resolved behind the scenes.',
    levels: [
      {
        label: 'Dice & Tactics (d20)',
        desc: 'Classic tabletop RPG feel. Uses d20 skill checks, AC, HP, action points, and tactical cover on the Grid for crisp mechanical stakes.',
      },
      {
        label: 'Deep Realism (Composure)',
        desc: 'Grounded psychological drama. Resolves tense beats through Composure, Stress, and realistic consequences instead of heroic d20 swings.',
      },
    ],
  },
  axxRating: {
    title: 'Mature Themes Intensity (0–4)',
    subtitle: 'Sets the ceiling for language, violence, romance, and dark subject matter.',
    levels: [
      { label: '0 — All-Ages / Cozy', desc: 'Clean, family-friendly adventure. No gore, swearing, or adult themes.' },
      { label: '1 — PG-13 Adventure', desc: 'Action tension, mild peril, and fade-to-black romance.' },
      { label: '2 — Gritty R-Rated (Default)', desc: 'Sharp dialogue, realistic stakes, moral gray areas, and grounded violence.' },
      { label: '3 — Raw Adult Drama', desc: 'Unflinching noir/thriller intensity, heavy emotional themes, and stark consequences.' },
      { label: '4 — Maximum Mature', desc: 'Unfiltered dark/adult themes (requires explicit confirmation checkbox).' },
    ],
  },
  scaryRating: {
    title: 'Horror & Suspense Level (0–3)',
    subtitle: 'Controls atmospheric dread, unsettling imagery, and psychological horror.',
    levels: [
      { label: '0 — None / Bright', desc: 'Zero horror elements. Keeps the mood adventurous, witty, or lighthearted.' },
      { label: '1 — Mild Suspense', desc: 'Classic mystery tension and eerie moments without true horror.' },
      { label: '2 — Psychological Dread (Default)', desc: 'Unsettling atmosphere, paranoia, uncanny details, and creeping tension.' },
      { label: '3 — Maximum Horror', desc: 'Relentless dread, body/cosmic horror, and high-stakes survival terror (requires confirmation).' },
    ],
  },
};
