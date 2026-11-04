import type { buildChannelOutboundRequest } from "./channels.js";

type Outbound = ReturnType<typeof buildChannelOutboundRequest>;
type BodyIsString = Outbound["body"] extends string ? true : never;
const bodyIsString: BodyIsString = true;
export { bodyIsString };
