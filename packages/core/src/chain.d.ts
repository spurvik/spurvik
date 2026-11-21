import type { AuditLink, AuditLinkFields } from "./types.js";
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
 * It is not a finding that a system meets the Act.
 */
export declare function signPurgeCheckpoint(fields: PurgeCheckpointFields, secret: string): Promise<SignedPurgeCheckpoint>;
/** A match shows the checkpoint fields still match the HMAC-SHA-256 signature made with your checkpoint secret. It is not a finding that a system meets the Act. */
export declare function verifyPurgeCheckpoint(checkpoint: SignedPurgeCheckpoint, secret: string): Promise<boolean>;
/**
 * Hash of one audit record, including `prevLogHash`, so a later edit or a
 * fork breaks the chain. A match shows the stored rows still link. Someone
 * with database write access can rewrite them. It is not externally anchored,
 * and it is not a certification of the AI system.
 */
export declare function computeRecordHash(fields: AuditLinkFields): Promise<string>;
export declare function sealAuditLink(fields: AuditLinkFields): Promise<AuditLink>;
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
export declare function verifyAuditChain(links: readonly AuditLink[], options?: VerifyAuditChainOptions): Promise<ChainVerification>;
/**
 * True when `recordHash` matches the current material, or the material sealed
 * before the marking field was renamed.
 */
export declare function auditLinkHashMatches(fields: AuditLinkFields, recordHash: string): Promise<boolean>;
/**
 * Hash used for rows sealed when the boolean was named `article50Watermarked`.
 * New rows use `computeRecordHash`. Verification accepts either spelling.
 */
export declare function computeLegacyRecordHash(fields: AuditLinkFields): Promise<string>;
