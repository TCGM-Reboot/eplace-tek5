const { PubSub } = require("@google-cloud/pubsub");
const pubsub = new PubSub();

const PING_TOPIC = process.env.PING_TOPIC; // ping-events-dev

exports.dispatcher = async (message, context) => {
  try {
    const raw = Buffer.from(message.data, "base64").toString("utf8");
    const event = JSON.parse(raw);

    const type = (event.type || "").toUpperCase();

    if (type === "PING") {
      await pubsub.topic(PING_TOPIC).publishMessage({
        data: Buffer.from(JSON.stringify(event))
      });
      console.log("Dispatched PING event");
      return;
    }

    console.log("Unknown event type, ignoring:", type);
  } catch (err) {
    console.error("dispatcher_failed", err);
    // Throwing will cause retry; for MVP you may prefer to not throw.
  }
};
