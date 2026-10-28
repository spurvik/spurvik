import type { AuditLink, AuditLinkFields } from "./types.js";
import { canonicalJson } from "./canonical.js";
import { hashCanonical, hmacSha256Hex, timingSafeEqualString } from "./hash.js";

const CHECKPOINT_KIND = "audit_purge_checkpoint";

/** Fields covered by a purge-checkpoint signature. `signature` is the output. */
export interface PurgeCheckpointFields {
  projectId: string;
  purgedThroughSeq: number;
  purgedThroughHash: string;
  /** ISO-8601 timestamp included in the signature. */
  purgedAt: string;
}

export interface SignedPurgeCheckpoint extends PurgeCheckpointFields {
  signature: string;
}

/**
 * Sign the last hash removed by a retention purge.
 * A later check shows the checkpoint still matches the HMAC-SHA-256 signature made with your checkpoint secret.
 * It is not a finding of legal compliance.
 */
export async function signPurgeCheckpoint(
  fields: PurgeCheckpointFields,
  secret: string,
): Promise<SignedPurgeCheckpoint> {
  if (!secret) throw new Error("A checkpoint signing secret is required.");
  const signature = await hmacSha256Hex(secret, canonicalJson({ kind: CHECKPOINT_KIND, ...fields }));
  return { ...fields, signature };
}

/** A match shows the checkpoint fields still match the HMAC-SHA-256 signature made with your checkpoint secret. It is not a finding of legal compliance. */
export async function verifyPurgeCheckpoint(
  checkpoint: SignedPurgeCheckpoint,
  secret: string,
): Promise<boolean> {
  const expected = await hmacSha256Hex(
    secret,
    canonicalJson({
      kind: CHECKPOINT_KIND,
      projectId: checkpoint.projectId,
      purgedThroughSeq: checkpoint.purgedThroughSeq,
      purgedThroughHash: checkpoint.purgedThroughHash,
      purgedAt: checkpoint.purgedAt,
    }),
  );
  return timingSafeEqualString(expected, checkpoint.signature);
}

/**
 * Hash of one audit record, including `prevLogHash`, so a later edit or a
 * fork breaks the chain. A match shows the stored rows still link. Someone
 * with database write access can rewrite them. It is not externally anchored,
 * and it is not a certification of the AI system.
 */
export async function computeRecordHash(fields: AuditLinkFields): Promise<string> {
  return hashCanonical(linkMaterial(fields));
}

export async function sealAuditLink(fields: AuditLinkFields): Promise<AuditLink> {
  const recordHash = await computeRecordHash(fields);
  return { ...fields, recordHash };
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  brokenAt?: string;
  reason?: string;
}

export interface VerifyAuditChainOptions {
  /**
   * Signed record of the last hash removed by retention. When present, the
   * first remaining row must continue that hash instead of starting at seq 1.
   */
  checkpoint?: SignedPurgeCheckpoint | null;
  /** HMAC secret for `checkpoint`. Required when a checkpoint is passed. */
  secret?: string;
}

/**
 * Recompute every record hash and check that each `prevLogHash` points at
 * the previous record. `links` may be unsorted; they are ordered by `seq`.
 * The first record in a project's chain uses `prevLogHash: null` and `seq: 1`,
 * unless a purge checkpoint anchors a later sequence.
 * Rows sealed before `contentMarkingApplied` still match: the same boolean
 * was hashed as `article50Watermarked`.
 */
export async function verifyAuditChain(
  links: readonly AuditLink[],
  options?: VerifyAuditChainOptions,
): Promise<ChainVerification> {
  const ordered = [...links].sort((left, right) => left.seq - right.seq);
  const checkpoint = options?.checkpoint ?? null;
  let previous: AuditLink | undefined;
  if (checkpoint) {
    if (!options?.secret) {
      return { ok: false, checked: 0, reason: "A purge checkpoint needs its signing secret." };
    }
    if (!(await verifyPurgeCheckpoint(checkpoint, options.secret))) {
      return {
        ok: false,
        checked: 0,
        reason: "Purge checkpoint signature does not match. A match would show the checkpoint still matches its HMAC signature; it is not a finding of legal compliance.",
      };
    }
    if (ordered.length === 0) return { ok: true, checked: 0 };
    const first = ordered[0];
    if (!first) return { ok: true, checked: 0 };
    if (first.projectId !== checkpoint.projectId) {
      return {
        ok: false,
        checked: 0,
        brokenAt: first.id,
        reason: "Purge checkpoint is for a different project.",
      };
    }
    if (first.seq !== checkpoint.purgedThroughSeq + 1 || first.prevLogHash !== checkpoint.purgedThroughHash) {
      return {
        ok: false,
        checked: 0,
        brokenAt: first.id,
        reason: "The first retained record does not continue the purge checkpoint.",
      };
    }
    previous = {
      ...first,
      seq: checkpoint.purgedThroughSeq,
      recordHash: checkpoint.purgedThroughHash,
      prevLogHash: null,
    };
  }
  for (const link of ordered) {
    if (!previous) {
      if (link.seq !== 1 || link.prevLogHash !== null) {
        return {
          ok: false,
          checked: 0,
          brokenAt: link.id,
          reason: "The first record must be seq 1 with a null prevLogHash.",
        };
      }
    } else {
      if (link.seq !== previous.seq + 1) {
        return {
          ok: false,
          checked: previous.seq,
          brokenAt: link.id,
          reason: `Expected seq ${previous.seq + 1} but found ${link.seq}.`,
        };
      }
      if (link.prevLogHash !== previous.recordHash) {
        return {
          ok: false,
          checked: previous.seq,
          brokenAt: link.id,
          reason: "prevLogHash does not match the previous record hash.",
        };
      }
    }
    if (!(await auditLinkHashMatches(link, link.recordHash))) {
      return {
        ok: false,
        checked: Math.max(0, link.seq - 1),
        brokenAt: link.id,
        reason: "Record hash does not match the stored fields.",
      };
    }
    previous = link;
  }
  return { ok: true, checked: ordered.length };
}

/**
 * True when `recordHash` matches the current material, or the material sealed
 * before the marking field was renamed.
 */
export async function auditLinkHashMatches(fields: AuditLinkFields, recordHash: string): Promise<boolean> {
  if ((await computeRecordHash(fields)) === recordHash) return true;
  return (await computeLegacyRecordHash(fields)) === recordHash;
}

/**
 * Hash used for rows sealed when the boolean was named `article50Watermarked`.
 * New rows use `computeRecordHash`. Verification accepts either spelling.
 */
export async function computeLegacyRecordHash(fields: AuditLinkFields): Promise<string> {
  return hashCanonical(linkMaterial(fields, "article50Watermarked"));
}

function linkMaterial(
  fields: AuditLinkFields,
  markingKey: "contentMarkingApplied" | "article50Watermarked" = "contentMarkingApplied",
): Record<string, unknown> {
  const material: Record<string, unknown> = {
    id: fields.id,
    projectId: fields.projectId,
    seq: fields.seq,
    eventId: fields.eventId,
    timestamp: fields.timestamp,
    modelProvider: fields.modelProvider,
    modelVersion: fields.modelVersion,
    inputHash: fields.inputHash,
    outputHash: fields.outputHash,
    contentHashMode: fields.contentHashMode,
    latencyMs: fields.latencyMs,
    temperature: fields.temperature,
    markingHookId: fields.markingHookId,
    hitlStatus: fields.hitlStatus,
    prevLogHash: fields.prevLogHash,
  };
  material[markingKey] = fields.contentMarkingApplied;
  if (fields.biometric) {
    material.biometric = {
      periodStart: fields.biometric.periodStart,
      periodEnd: fields.biometric.periodEnd,
      referenceDatabase: fields.biometric.referenceDatabase,
      inputReference: fields.biometric.inputReference,
      checkers: [...fields.biometric.checkers],
    };
  }
  if (fields.decisionRef) {
    material.decisionRef = {
      approvalId: fields.decisionRef.approvalId,
      status: fields.decisionRef.status,
      source: fields.decisionRef.source,
    };
  }
  if (fields.oversightRef) {
    material.oversightRef = {
      op: fields.oversightRef.op,
      scope: fields.oversightRef.scope,
      target: fields.oversightRef.target,
      priorHalted: fields.oversightRef.priorHalted,
    };
  }
  return material;
}
