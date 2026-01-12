import { z } from "zod";

export const WtpSignalSchema = z.enum(["STRONG", "MEDIUM", "WEAK", "NONE"]);
export const IntentTypeSchema = z.enum([
	"TOOL_DEMAND",
	"DISCUSSION",
	"CONSUMER",
	"OTHER",
]);

const ScoreSchema = z.number().int().min(1).max(5);

const ScoresSchema = z
	.object({
		pain: ScoreSchema,
		intent: ScoreSchema,
		workaround: ScoreSchema,
		audience: ScoreSchema,
		wtp: ScoreSchema,
		risk: ScoreSchema,
		uncertainty: ScoreSchema,
	})
	.strict();

const EvidenceSchema = z
	.object({
		pain_quote: z.string().min(1).nullable(),
		workaround_quote: z.string().min(1).nullable(),
		ask_quote: z.string().min(1).nullable(),
	})
	.strict();

const ScoreNotesSchema = z
	.object({
		pain: z.string().min(1).optional(),
		intent: z.string().min(1).optional(),
		workaround: z.string().min(1).optional(),
		audience: z.string().min(1).optional(),
		wtp: z.string().min(1).optional(),
		risk: z.string().min(1).optional(),
		uncertainty: z.string().min(1).optional(),
	})
	.strict();

const BaseSchema = z
	.object({
		intent_type: IntentTypeSchema,
		title: z.string().min(1),
		who: z.string().min(1).optional(),
		pain: z.string().min(1).optional(),
		trigger: z.string().min(1).optional(),
		workaround: z.string().min(1).optional(),
		wtp_signal: WtpSignalSchema,
		source_url: z.string().min(1),
		tags: z.array(z.string().min(1)).max(5).optional(),
		no_demand_reason: z.string().min(1).optional(),
		scores: ScoresSchema,
		evidence: EvidenceSchema,
		evidence_hits: z.number().int().min(0).max(3).optional(),
		opportunity_score: z.number().int().optional(),
		next_action: z.array(z.string().min(1)).min(1).max(3),
		score_notes: ScoreNotesSchema.optional(),
		evidence_quote: z.string().min(1).nullable().optional(),
	})
	.strict();

const DemandSchema = BaseSchema.extend({
	kind: z.literal("DEMAND"),
	who: z.string().min(1),
	pain: z.string().min(1),
	trigger: z.string().min(1),
	workaround: z.string().min(1),
	wtp_signal: WtpSignalSchema,
}).strict();

const NoDemandSchema = BaseSchema.extend({
	kind: z.literal("NO_DEMAND"),
	no_demand_reason: z.string().min(1),
	wtp_signal: z.literal("NONE"),
}).strict();

export const NeedCardV2Schema = z.discriminatedUnion("kind", [
	DemandSchema,
	NoDemandSchema,
]);

export type NeedCardV2 = z.infer<typeof NeedCardV2Schema>;
