import { Deck, Track, BingoCard } from "../../types/deck";
import {
  BingoCellContentSelection,
  normalizeCellContent,
  normalizeArtistKey,
  usesAuthorPool,
} from "./cellContent";
import { cardSeedForNumber, generateSingleBingoCard, isBlankCell } from "./generateCards";

export const CARD_VERIFICATION_PREFIX = "B1";
export const CARD_VERIFICATION_VERSION = 1;

const FINGERPRINT_BYTES = 4;
const SEED_BYTES = 4;
const TOKEN_HEADER_BYTES = 12;
const TOKEN_BYTES = 14;
const MAX_CARD_NUMBER = 255;
const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export interface CardVerificationPayload {
  version: number;
  fingerprintHex: string;
  batchSeed: string;
  cardNumber: number;
  gridSize: number;
  bingoPercent: number;
  cellContent: BingoCellContentSelection;
}

export interface VerifiedMissingCell {
  index: number;
  row: number;
  column: number;
  title: string;
  artist: string;
}

export type CardVerificationResult =
  | {
      kind: "invalid-code";
      message: string;
    }
  | {
      kind: "deck-mismatch";
      message: string;
      payload: CardVerificationPayload;
      expectedFingerprintHex: string;
    }
  | {
      kind: "verified";
      payload: CardVerificationPayload;
      card: BingoCard;
      lineRows: number[];
      bingo: boolean;
      lineAwarded: boolean;
      lineAccepted: boolean;
      filledCellCount: number;
      calledCellCount: number;
      missingCells: VerifiedMissingCell[];
    };

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string, expectedBytes: number): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(value) || value.length !== expectedBytes * 2) {
    throw new Error("Invalid fingerprint.");
  }
  const bytes = new Uint8Array(expectedBytes);
  for (let index = 0; index < expectedBytes; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesEqual(first: Uint8Array, second: Uint8Array): boolean {
  if (first.length !== second.length) return false;
  return first.every((byte, index) => byte === second[index]);
}

function encodeBase32(bytes: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string): Uint8Array {
  let buffer = 0;
  let bits = 0;
  const output: number[] = [];
  for (const character of value) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error("Invalid card code characters.");
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >>> bits) & 0xff);
    }
  }
  return new Uint8Array(output);
}

function checksum(bytes: Uint8Array): number {
  let value = 0xffff;
  for (const byte of bytes) {
    value ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 0x8000) !== 0 ? (value << 1) ^ 0x1021 : value << 1;
      value &= 0xffff;
    }
  }
  return value;
}

function maskForCellContent(selection: BingoCellContentSelection): number {
  return (selection.numbers ? 1 : 0) | (selection.songs ? 2 : 0) | (selection.authors ? 4 : 0);
}

function cellContentForMask(mask: number): BingoCellContentSelection {
  return normalizeCellContent({
    numbers: (mask & 1) !== 0,
    songs: (mask & 2) !== 0,
    authors: (mask & 4) !== 0,
  });
}

function seedBytes(seed: string): Uint8Array {
  if (!/^[0-9a-f]{8}$/i.test(seed)) throw new Error("Invalid batch seed.");
  return hexToBytes(seed, SEED_BYTES);
}

export function createCardBatchSeed(): string {
  const bytes = new Uint8Array(SEED_BYTES);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToHex(bytes);
}

function verificationDeckPayload(deck: Deck): string {
  return JSON.stringify({
    provider: deck.provider,
    tracks: deck.tracks.map((track) => ({
      title: track.title.trim(),
      artist: track.artist.trim(),
      start: track.startTime,
      end: track.endTime,
      media: track.media ? { provider: track.media.provider, id: track.media.id } : null,
    })),
  });
}

export async function computeDeckFingerprintBytes(deck: Deck): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verificationDeckPayload(deck))
  );
  return new Uint8Array(digest).slice(0, FINGERPRINT_BYTES);
}

export async function computeDeckFingerprintHex(deck: Deck): Promise<string> {
  return bytesToHex(await computeDeckFingerprintBytes(deck));
}

export function encodeCardVerificationCode(payload: Omit<CardVerificationPayload, "version">): string {
  const fingerprint = hexToBytes(payload.fingerprintHex, FINGERPRINT_BYTES);
  const seed = seedBytes(payload.batchSeed);
  const cardNumber = Math.round(payload.cardNumber);
  const gridSize = Math.round(payload.gridSize);
  const bingoPercent = Math.round(payload.bingoPercent);
  if (cardNumber < 1 || cardNumber > MAX_CARD_NUMBER) throw new Error("Invalid card number.");
  if (gridSize < 3 || gridSize > 6) throw new Error("Invalid grid size.");
  if (bingoPercent < 1 || bingoPercent > 100) throw new Error("Invalid Bingo percentage.");

  const body = new Uint8Array(TOKEN_HEADER_BYTES);
  body[0] = CARD_VERIFICATION_VERSION;
  body.set(fingerprint, 1);
  body.set(seed, 1 + FINGERPRINT_BYTES);
  body[9] = cardNumber;
  const config = (gridSize << 13) | (maskForCellContent(normalizeCellContent(payload.cellContent)) << 10) | bingoPercent;
  body[10] = (config >>> 8) & 0xff;
  body[11] = config & 0xff;

  const token = new Uint8Array(TOKEN_BYTES);
  token.set(body);
  const value = checksum(body);
  token[12] = (value >>> 8) & 0xff;
  token[13] = value & 0xff;
  return `${CARD_VERIFICATION_PREFIX}-${encodeBase32(token)}`;
}

export function decodeCardVerificationCode(rawCode: string): CardVerificationPayload {
  const normalized = rawCode.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!normalized.startsWith(CARD_VERIFICATION_PREFIX)) {
    throw new Error("This is not a Musical Bingo card code.");
  }
  const encoded = normalized.slice(CARD_VERIFICATION_PREFIX.length);
  const token = decodeBase32(encoded);
  if (token.length !== TOKEN_BYTES) throw new Error("The card code is incomplete.");
  const body = token.slice(0, TOKEN_HEADER_BYTES);
  const storedChecksum = (token[12] << 8) | token[13];
  if (checksum(body) !== storedChecksum) throw new Error("The card code is invalid or mistyped.");
  if (body[0] !== CARD_VERIFICATION_VERSION) throw new Error("This card code version is not supported.");

  const config = (body[10] << 8) | body[11];
  const gridSize = (config >>> 13) & 0x7;
  const mask = (config >>> 10) & 0x7;
  const bingoPercent = config & 0x7f;
  if (gridSize < 3 || gridSize > 6 || bingoPercent < 1 || bingoPercent > 100) {
    throw new Error("The card code contains invalid settings.");
  }

  return {
    version: body[0],
    fingerprintHex: bytesToHex(body.slice(1, 1 + FINGERPRINT_BYTES)),
    batchSeed: bytesToHex(body.slice(1 + FINGERPRINT_BYTES, 1 + FINGERPRINT_BYTES + SEED_BYTES)),
    cardNumber: body[9],
    gridSize,
    bingoPercent,
    cellContent: cellContentForMask(mask),
  };
}

function calledForTrack(
  track: Track,
  deck: Deck,
  calledTrackIds: ReadonlySet<string>,
  authorMode: boolean
): boolean {
  if (!authorMode) return calledTrackIds.has(track.id);
  const authorKey = normalizeArtistKey(track.artist);
  return deck.tracks.some(
    (candidate) => normalizeArtistKey(candidate.artist) === authorKey && calledTrackIds.has(candidate.id)
  );
}

export async function verifyCardCode(
  rawCode: string,
  deck: Deck,
  calledTrackIds: ReadonlySet<string>,
  lineAwarded: boolean
): Promise<CardVerificationResult> {
  let payload: CardVerificationPayload;
  try {
    payload = decodeCardVerificationCode(rawCode);
  } catch (error) {
    return {
      kind: "invalid-code",
      message: error instanceof Error ? error.message : "The card code could not be read.",
    };
  }

  const expectedFingerprint = await computeDeckFingerprintBytes(deck);
  const actualFingerprint = hexToBytes(payload.fingerprintHex, FINGERPRINT_BYTES);
  if (!bytesEqual(actualFingerprint, expectedFingerprint)) {
    return {
      kind: "deck-mismatch",
      message: "This card was created from a different version of the current deck.",
      payload,
      expectedFingerprintHex: bytesToHex(expectedFingerprint),
    };
  }

  const card = generateSingleBingoCard(deck.tracks, payload.cardNumber, {
    gridSize: payload.gridSize,
    bingoPercent: payload.bingoPercent,
    cellContent: payload.cellContent,
    seed: cardSeedForNumber(payload.batchSeed, payload.cardNumber),
  });
  const authorMode = usesAuthorPool(payload.cellContent);
  const filledCells = card.grid
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => !isBlankCell(cell) && Boolean(cell.track));
  const calledIndexes = new Set(
    filledCells
      .filter(({ cell }) => cell.track && calledForTrack(cell.track, deck, calledTrackIds, authorMode))
      .map(({ index }) => index)
  );
  const missingCells: VerifiedMissingCell[] = filledCells
    .filter(({ index }) => !calledIndexes.has(index))
    .map(({ cell, index }) => ({
      index,
      row: Math.floor(index / payload.gridSize) + 1,
      column: (index % payload.gridSize) + 1,
      title: cell.track?.title ?? "",
      artist: cell.track?.artist ?? "",
    }));

  const lineRows: number[] = [];
  for (let row = 0; row < payload.gridSize; row += 1) {
    const rowIndexes = filledCells
      .filter(({ index }) => Math.floor(index / payload.gridSize) === row)
      .map(({ index }) => index);
    if (rowIndexes.length > 0 && rowIndexes.every((index) => calledIndexes.has(index))) {
      lineRows.push(row + 1);
    }
  }

  const bingo = missingCells.length === 0 && filledCells.length > 0;
  return {
    kind: "verified",
    payload,
    card,
    lineRows,
    bingo,
    lineAwarded,
    lineAccepted: !bingo && lineRows.length > 0 && !lineAwarded,
    filledCellCount: filledCells.length,
    calledCellCount: calledIndexes.size,
    missingCells,
  };
}
