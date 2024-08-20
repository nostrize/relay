import type { Event } from "nostr-tools";

import { is32ByteHex, parseAmountTag } from "./utils";

// LNURL-P service: received zap request event coming from nostrize extension
function receiveZapRequest(event: Event) {
  // verify sig
  const { id, pubkey, created_at, kind, tags, content, sig } = event;

  if (pubkey !== process.env.NOSTRIZE_PUBKEY) {
    throw new Error("pubkey is wrong");
  }
  
  let receipient, amountMillisats;
  
  tags.forEach(([key, value]) => {
    if (key === "p" && value) {
      if (!is32ByteHex(value)) {
        throw new Error("p tag is not in correct format");
      }
  
      receipient = value;
    }
  
    if (key === "amount" && value) {
      const parsed = parseAmountTag(value);
  
      if (!parsed) {
        throw new Error("amount tag is in wrong format");
      }
      
      amountMillisats = parsed;
    }
  });

  // generate the invoice
  // send the response back in { pr: bolt11 } format
}
