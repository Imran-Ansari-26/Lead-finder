import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a YouTube outreach analyst for a video editor specialising in motion graphics, B-roll, and polished talking-head videos. Evaluate whether each YouTube creator is a high-value outreach target.

STRONG FIT criteria (must match most):
- Sells something: course, coaching, SaaS, consulting, agency, digital product
- 3k–120k subscribers (big enough to pay, small enough to need help)
- Posted within last 6 weeks
- Editing is basic/functional (plain cuts, static titles, no motion graphics)
- English-speaking OR clearly monetised non-English content

POSSIBLE FIT:
- Some product signals but unclear, OR subscriber range 1k–200k
- Posted in last 3 months, editing could be upgraded

WEAK FIT:
- Pure entertainment, gaming, no monetisation signal
- >250k subs OR <500 subs
- Inactive >4 months
- Already has agency-level production

Return ONLY valid JSON, no markdown fences:
{
  "channel_name": "string",
  "subscriber_count": "string",
  "niche": "string (2-4 words)",
  "has_product": boolean,
  "product_type": "string or null",
  "last_post": "string",
  "posting_frequency": "string",
  "editing_quality": "basic | moderate | polished",
  "avg_views": "string or null",
  "fit_score": "Strong fit | Possible fit | Weak fit",
  "fit_reason": "1 concise sentence",
  "email_hook": "1-sentence personalised opener for a cold outreach DM"
}`;

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type, imageBase64, mediaType, url, context } = req.body;

  try {
    let messages;
    if (type === "screenshot") {
      messages = [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
            { type: "text", text: "Analyse this YouTube channel screenshot and return the JSON evaluation." },
          ],
        },
      ];
    } else {
      messages = [
        {
          role: "user",
          content: `Analyse this YouTube channel.\n\nURL: ${url}\nContext: ${context || "None provided"}`,
        },
      ];
    }

    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: SYSTEM,
      messages,
    });

    const raw = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("Could not parse AI response");
    }

    if (!parsed.channel_name) throw new Error("Invalid response: missing channel_name");

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Analysis error:", err);
    return res.status(500).json({ error: err.message || "Analysis failed" });
  }
}
