import { z } from "zod";

const EvidenceQuoteSchema = z.string().min(40).max(240);

export const WtpSignalSchema = z.enum(["STRONG", "MEDIUM", "WEAK", "NONE"]);

const DemandSchema = z
	.object({
		kind: z.literal("DEMAND"),
		title: z.string().min(1),
		who: z.string().min(1),
		pain: z.string().min(1),
		trigger: z.string().min(1),
		workaround: z.string().min(1),
		wtp_signal: WtpSignalSchema,
		evidence_quote: EvidenceQuoteSchema,
		source_url: z.string().min(1),
		tags: z.array(z.string().min(1)).max(5).optional(),
	})
	.strict();

const NoDemandSchema = z
	.object({
		kind: z.literal("NO_DEMAND"),
		title: z.string().min(1),
		no_demand_reason: z.string().min(1),
		wtp_signal: z.literal("NONE"),
		evidence_quote: EvidenceQuoteSchema,
		source_url: z.string().min(1),
		who: z.string().min(1).optional(),
		pain: z.string().min(1).optional(),
		trigger: z.string().min(1).optional(),
		workaround: z.string().min(1).optional(),
		tags: z.array(z.string().min(1)).max(5).optional(),
	})
	.strict();

export const NeedCardV1Schema = z.discriminatedUnion("kind", [
	DemandSchema,
	NoDemandSchema,
]);

export type NeedCardV1 = z.infer<typeof NeedCardV1Schema>;
