import crypto from 'node:crypto';
import { verifyEvent, type Event } from "nostr-tools/pure";
import { kinds } from "nostr-tools";
import { decode as decodeBolt11 } from 'bolt11';

import { isOneOf, isValidTimestamp, not, parseTag } from "./utils";
import { getDb } from "./db";
import { getSubscriptionMaps, safeInsert, safeTraverse } from "./websockets";

const boostMaps = getSubscriptionMaps();
const receiptMaps = getSubscriptionMaps();
const db = getDb();

const server = Bun.serve({
  fetch(req, server) {
    const success = server.upgrade(req);
    if (success) {
      return undefined;
    }

    return new Response("501 Error");
  },
  websocket: {
    message(ws, message) {
      if (Buffer.isBuffer(message)) {
        ws.send(
          JSON.stringify(["NOTICE", "error: Buffer message is not supported"]),
        );
        ws.close();

        return;
      }

      let parsedMessage;

      try {
        parsedMessage = JSON.parse(message);
      } catch (err) {
        ws.send(
          JSON.stringify(["NOTICE", "error: could not parse JSON: " + err]),
        );
        ws.close();

        return;
      }

      if (!Array.isArray(parsedMessage)) {
        ws.send(JSON.stringify(["NOTICE", "message must be an array"]));
        ws.close();

        return;
      }

      const [type, ...params] = parsedMessage;

      if (not(isOneOf(type, ["REQ", "EVENT", "CLOSE"]))) {
        ws.send(JSON.stringify(["NOTICE", `unknown message type ${type}`]));
        ws.close();

        return;
      }

      if (type === "REQ") {
        handleNewSubscriber({ ws, params });
      } else if (type === "EVENT") {
        handleNewEvent({ ws, params });
      } else if (type === "CLOSE") {
        const subsciptionId = params[0];

        boostMaps.toFilter.delete(subsciptionId);
        boostMaps.toSocket.delete(subsciptionId);

        receiptMaps.toFilter.delete(subsciptionId);
        receiptMaps.toSocket.delete(subsciptionId);

        ws.send(JSON.stringify(["CLOSE", subsciptionId]));
        ws.close();

        return;
      }
    }
  },
});

function handleNewSubscriber({ ws, params }: any) {
  // a new subsciption
  const [subscriptionId, ...filters] = params;

  if (filters.length > 1) {
    ws.send(JSON.stringify(["NOTICE", "we don't support multiple filters"]));
    ws.close();

    return;
  }

  const filter = filters[0];

  // kinds
  const isFilterKindSupported = filter.kinds.every((k: number) =>
    isOneOf(k, [kinds.ShortTextNote, kinds.Zap]),
  );
  const isFilterKindOk = filter.kinds.length === 1 && isFilterKindSupported;

  if (!isFilterKindOk) {
    ws.send(JSON.stringify(["NOTICE", "we don't support this filter kinds"]));
    ws.close();

    return;
  }

  const kind: number = filter.kinds[0];

  // authors
  const isAuthorNostrize =
    filter.authors.length === 1 &&
    filter.authors[0] === process.env.NOSTRIZE_PUBKEY;

  if (!isAuthorNostrize) {
    ws.send(
      JSON.stringify([
        "NOTICE",
        "we don't support subscriptions other than nostrize pubkey",
      ]),
    );
    ws.close();

    return;
  }

  let rows: any[] = [];

  if (kind === kinds.ShortTextNote) {
    // boosts
    
    let query = "SELECT json FROM boosts WHERE 1 = 1";

    if (filter["from"]) {
      query += " AND from = $from";
    }

    if (filter["to"]) {
      query += " AND to = $to";
    }

    if (filter.since) {
      query += " AND created_at >= $since"
    }

    if (filter.until) {
      query += " AND created_at < $until"
    }

    if (filter.ids && filter.ids.length) {
      query += ` AND event_id IN (${filter.ids.join(", ")})`
    }

    rows = db.query(query).all({ 
      $author: process.env.NOSTRIZE_PUBKEY, 
      $from: filter["from"], 
      $to: filter["to"], 
      $since: filter.since,
      $until: filter.until,
    } as any);

    rows.forEach((row) => {
      const json = JSON.parse(row.json);

      ws.send(JSON.stringify(["EVENT", subscriptionId, json]));
    });

    ws.send(JSON.stringify(["EOSE", subscriptionId]));

    safeInsert(boostMaps.toFilter, subscriptionId, filter);
    safeInsert(boostMaps.toSocket, subscriptionId, ws);
  } else if (kind === kinds.Zap) {
    // receipts

    let query = "SELECT json FROM receipts WHERE 1 = 1";

    if (filter["#p"]) {
      query += " AND p = $p";
    }

    if (filter.since) {
      query += " AND created_at >= $since"
    }

    if (filter.until) {
      query += " AND created_at < $until"
    }

    if (filter.ids && filter.ids.length) {
      query += ` AND event_id IN (${filter.ids.join(", ")})`
    }

    rows = db.query(query).all({ 
      $p: filter["#p"],
      $since: filter.since,
      $until: filter.until,
    } as any);

    safeInsert(receiptMaps.toFilter, subscriptionId, filter);
    safeInsert(receiptMaps.toSocket, subscriptionId, ws);
  }
}

function handleNewEvent({ ws, params }: any) {
  const event = params[0];

  const { id, pubkey, created_at, kind, tags, content, sig } = event;

  if (not(isOneOf(kind, [kinds.ShortTextNote, kinds.Zap]))) {
    ws.send(JSON.stringify(["NOTICE", "kind is not supported"]));
    ws.close();

    return;
  }

  if (pubkey !== process.env.NOSTRIZE_PUBKEY) {
    ws.send(JSON.stringify(["NOTICE", "we don't support events with pubkey other than nostrize"]));
    ws.close();

    return;
  }

  if (typeof content !== "string") {
    ws.send(JSON.stringify(["NOTICE", "content is not string"]));
    ws.close();

    return;
  }

  if (!isValidTimestamp(created_at)) {
    ws.send(
      JSON.stringify([
        "NOTICE",
        "created_at field is not within time range of the server time",
      ]),
    );
    ws.close();

    return;
  }

  if (!Array.isArray(tags)) {
    ws.send(JSON.stringify(["NOTICE", "tags should be an array"]));
    ws.close();

    return;
  }

  const verified = verifyEvent(event);

  if (!verified) {
    ws.send(JSON.stringify(["NOTICE", "error: signature is not verified"]));
    ws.close();

    return;
  }

  if (kind === kinds.Zap) {
    const p = parseTag("p", tags);

    if (!p) {
      ws.send(JSON.stringify(["NOTICE", "we require a 'p' tag"]));
      ws.close();

      return;
    }

    const bolt11 = parseTag("bolt11", tags);

    if (!bolt11) {
      ws.send(JSON.stringify(["NOTICE", "we require a 'bolt11' tag"]));
      ws.close();

      return;
    }

    const preimage = parseTag("preimage", tags);

    if (!preimage) {
      ws.send(JSON.stringify(["NOTICE", "we require a 'preimage' tag"]));
      ws.close();

      return;
    }

    // verify preimage with bolt11
    const bolt11Decoded = decodeBolt11(bolt11);
    const hash = crypto.createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
    
    if (bolt11Decoded.tagsObject.payment_hash !== hash) {
      ws.send(JSON.stringify(["NOTICE", "preimage does not match"]));
      ws.close();

      return;
    }
    
    // insert receipt to db
    const insertReceipt = `INSERT INTO receipts (event_id, created_at, p, amount, bolt11, preimage, json) 
                           VALUES ($event_id, $created_at, $p, $amount, $bolt11, $preimage, $json)`;

    const amountMillisats = bolt11Decoded.millisatoshis || (bolt11Decoded.satoshis ? bolt11Decoded.satoshis * 1000 : 0);

    const params = {
      $event_id: event.id,
      $created_at: event.created_at,
      $p: p,
      $amount: amountMillisats,
      $bolt11: bolt11,
      $preimage: preimage,
      $json: JSON.stringify(event)
    };

    db.run(insertReceipt, [params]);

    safeTraverse(receiptMaps.toFilter, () => {
      receiptMaps.toFilter.forEach((filter, subsciptionId) => {
        if (filter.since && event.created_at < filter.since) { 
          // event is before since 
          return;
        }

        if (filter.until && event.created_at > filter.until) { 
          // event is after until
          return;
        }

        if (filter.ids && filter.ids.every((id) => id !== event.id)) { 
          return;
        }

        // this event can go to ws
        const ws = receiptMaps.toSocket.get(subsciptionId);
        
        ws?.send(JSON.stringify(["EVENT", event]));
      });
    });
  }
  /*
    { pubkey: nostrize, 
      created_at: ...,
      kind: 1, 
      tags: [
        ["e", "zap-receipt-event"],
        ["from": "user name"],
        ["to": "user/org, repo, issue, PR as URLs"],
        ["amount": "milli sats"],
        ["message", "...."]
      ], 
      content: "message built from the tags, a readable version for other clients" }
  */
}

console.log(`Listening on ${server.hostname}:${server.port}`);
