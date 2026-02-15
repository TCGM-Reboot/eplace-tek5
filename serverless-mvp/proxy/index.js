const { PubSub } = require("@google-cloud/pubsub");
const pubsub = new PubSub();

const TOPIC = process.env.EVENTS_TOPIC; // discord-events-dev

exports.proxy = async (req, res) => {
  try {
    // For MVP we accept JSON like: { "type": "PING", "payload": {...} }
    const body = typeof req.body === "object" ? req.body : {};

    const event = {
      type: body.type || "PING",
      payload: body.payload || {},
      receivedAt: new Date().toISOString()
    };

    const dataBuffer = Buffer.from(JSON.stringify(event));
    await pubsub.topic(TOPIC).publishMessage({ data: dataBuffer });

    // For Discord interactions later, you'll return the correct JSON response format.
    res.status(200).json({ ok: true, enqueued: event.type });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "proxy_failed" });
  }
};
