import { describe, expect, it } from "vitest";
import { parseListing } from "@/lib/listing/parse";
import { checkReplies } from "@/lib/seller-replies";
import { isChat, sellerSide } from "./chat";
import { routeMessage } from "./route";

const VIN = "4T1B11HK8JU145889";
const AD = parseListing("2018 Toyota Camry LE $14,500 126,000 miles clean title no accidents private seller");

// Typical conversations: a Marketplace scam, an honest seller, a labelled chat, and a Messenger screenshot read by OCR.
const CHATS = {
  scam: `Marketplace · 2018 Toyota Camry LE
Is this still available?
10:42 AM
Yes it is still available. I'm currently deployed overseas so the car is with a shipping company
Can I see it this weekend?
Unfortunately no but they deliver to your door. You just need to send a $500 refundable deposit with Zelle to hold it
Seen`,
  honest: `Hi, is this still available?
Yes
Great. Does it have a clean title and is it in your name?
Yes clean title in my name, I've owned it 6 years
Any accidents?
No accidents. I have all the service records
Can my mechanic look at it Saturday?
Sure, I'm free after 10am`,
  labelled: `Me: Hi, is the Camry still for sale?
Seller: yes, 14,500 firm
Me: can I bring my mechanic?
Seller: no inspections, cash only today, I have other buyers coming`,
  messenger: `Jessica Miller
Active 5m ago
2018 Toyota Camry LE · $14,500
You sent
Is this still available?
Jessica
yes but i need to sell today, my husband is selling it for his brother
You sent
Can I see the title?
Jessica
title is coming in the mail
Message...`,
};

describe("a pasted or screenshotted chat with the seller", () => {
  it("is recognised as a chat, not a listing, a question or a fact", () => {
    for (const [k, t] of Object.entries(CHATS)) expect(routeMessage(t, VIN).kind, k).toBe("chat");
  });

  it("keeps only the seller's words (no buyer questions, no app buttons, no names or times)", () => {
    expect(sellerSide(CHATS.labelled)).toBe("yes, 14,500 firm\nno inspections, cash only today, I have other buyers coming");
    expect(sellerSide(CHATS.messenger)).toBe("yes but i need to sell today, my husband is selling it for his brother\ntitle is coming in the mail");
    const honest = sellerSide(CHATS.honest);
    expect(honest).not.toMatch(/still available|Any accidents\?|Can my mechanic/);
    expect(honest).toContain("No accidents. I have all the service records");
  });

  it("the seller's words raise the right warnings, and an honest chat raises none", () => {
    const ids = (t: string) => checkReplies(sellerSide(t), AD).map((h) => h.id);
    expect(ids(CHATS.scam)).toEqual(expect.arrayContaining(["msg-pay-app-upfront", "msg-shipping-only", "msg-seller-remote"]));
    expect(ids(CHATS.labelled)).toEqual(expect.arrayContaining(["msg-no-inspection", "msg-rushed"]));
    expect(ids(CHATS.messenger)).toEqual(expect.arrayContaining(["msg-curbstoning", "msg-rushed"]));
    expect(ids(CHATS.honest)).toEqual([]);
  });

  it("a listing page with a 'Message' button and 'Is this still available?' is still a listing", () => {
    const page = `2019 Honda Civic LX\n$15,900\n42,000 miles\nVIN 2HGFC2F69KH512345\nIs this still available?\nMessage\nSend seller a message\nSeller details`;
    expect(isChat(page, 3)).toBe(false);
  });
});
