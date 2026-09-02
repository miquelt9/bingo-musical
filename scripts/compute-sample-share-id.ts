import { SAMPLE_POP_HITS_DECK } from "../src/lib/storage/mockDeck";
import { buildCanonicalSharePayload, computeShareId, serializeCanonicalPayload } from "../src/lib/share/deckCanonical";

const canonical = buildCanonicalSharePayload(SAMPLE_POP_HITS_DECK);
const shareId = await computeShareId(canonical);

console.log(`Sample deck share id: ${shareId}`);
console.log(`Canonical payload bytes: ${serializeCanonicalPayload(canonical).length}`);
