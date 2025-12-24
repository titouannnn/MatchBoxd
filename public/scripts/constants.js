/**
 * Current version of the cache schema.
 * Used to invalidate old cache entries when the structure changes.
 * @type {string}
 */
export const CACHE_VERSION = 'v1';

/**
 * Duration in milliseconds for which user data is cached.
 * Default: 24 hours.
 * @type {number}
 */
export const USER_CACHE_DURATION = 1000 * 60 * 60 * 24;

/**
 * List of poster filenames used for the background animation.
 * @type {string[]}
 */
export const POSTERS = [
    "12-years-a-slave.jpg", "1917.jpg", "a-clockwork-orange.jpg", "after-hours.jpg", "akira.jpg",
    "anatomy-of-a-fall.jpg", "apollo-13.jpg", "arrival-2016.jpg", "asterix-obelix-mission-cleopatra.jpg",
    "autumn-sonata.jpg", "barry-lyndon.jpg", "before-midnight.jpg", "before-sunrise.jpg", "before-sunset.jpg",
    "black-swan.jpg", "blade-runner-2049.jpg", "boogie-nights.jpg", "carlitos-way.jpg", "casino.jpg",
    "castle-in-the-sky.jpg", "chainsaw-man-the-movie-reze-arc.jpg", "children-of-men.jpg", "chungking-express.jpg",
    "conclave.jpg", "dead-poets-society.jpg", "decision-to-leave.jpg", "django-unchained.jpg", "dreams.jpg",
    "dune-part-two.jpg", "everything-everywhere-all-at-once.jpg", "eyes-wide-shut.jpg", "f1.jpg", "fight-club.jpg",
    "forrest-gump.jpg", "free-solo.jpg", "ghost-in-the-shell.jpg", "gladiator-2000.jpg", "gone-girl.jpg",
    "good-will-hunting.jpg", "goodfellas.jpg", "green-book.jpg", "harakiri.jpg", "heat-1995.jpg",
    "howls-moving-castle.jpg", "incendies.jpg", "inception.jpg", "inglourious-basterds.jpg", "interstellar.jpg",
    "kikis-delivery-service.jpg", "kill-bill-vol-1.jpg", "la-haine.jpg", "lawrence-of-arabia.jpg", "le-samourai.jpg",
    "leon-the-professional.jpg", "memento.jpg", "memories-of-murder.jpg", "memories.jpg", "million-dollar-baby.jpg",
    "mulholland-drive.jpg", "my-neighbor-totoro.jpg", "neon-genesis-evangelion-the-end-of-evangelion.jpg",
    "nightcrawler.jpg", "no-country-for-old-men.jpg", "oldboy.jpg", "one-battle-after-another.jpg",
    "one-flew-over-the-cuckoos-nest.jpg", "oss-117-cairo-nest-of-spies.jpg", "oss-117-lost-in-rio.jpg",
    "paprika-2006.jpg", "parasite-2019.jpg", "past-lives.jpg", "perfect-blue.jpg", "phantom-thread.jpg",
    "porco-rosso.jpg", "pretty-woman.jpg", "princess-mononoke.jpg", "prisoners.jpg", "pulp-fiction.jpg",
    "scarface-1983.jpg", "se7en.jpg", "shutter-island.jpg", "sicario-2015.jpg", "skyfall.jpg", "spirited-away.jpg",
    "spotlight.jpg", "stalker.jpg", "star-wars-episode-iii-revenge-of-the-sith.jpg", "star-wars.jpg",
    "taxi-driver.jpg", "the-apartment.jpg", "the-artist.jpg", "the-celebration.jpg", "the-dark-knight.jpg",
    "the-departed.jpg", "the-empire-strikes-back.jpg", "the-godfather-part-ii.jpg", "the-godfather.jpg",
    "the-grand-budapest-hotel.jpg", "the-handmaiden.jpg", "the-hateful-eight.jpg", "the-holdovers.jpg",
    "the-lives-of-others.jpg", "the-phoenician-scheme.jpg", "the-prestige.jpg", "the-shawshank-redemption.jpg",
    "the-social-network.jpg", "the-summit-of-the-gods.jpg", "the-usual-suspects.jpg", "the-wolf-of-wall-street.jpg",
    "there-will-be-blood.jpg", "tokyo-godfathers.jpg", "trainspotting.jpg", "v-for-vendetta.jpg",
    "whiplash-2014.jpg", "your-name.jpg", "zodiac.jpg"
];
