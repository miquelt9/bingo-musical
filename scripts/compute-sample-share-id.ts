import { SAMPLE_DEEZER_DECK } from "../src/lib/storage/mockDeck";
import { buildCanonicalSharePayload, computeShareId, serializeCanonicalPayload } from "../src/lib/share/deckCanonical";

const canonical = buildCanonicalSharePayload(SAMPLE_DEEZER_DECK);
const shareId = await computeShareId(canonical);

console.log(`Starter deck share id: ${shareId}`);
console.log(`Canonical payload bytes: ${serializeCanonicalPayload(canonical).length}`);
