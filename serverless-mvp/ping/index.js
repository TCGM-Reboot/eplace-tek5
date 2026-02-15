exports.ping = async (message, context) => {
  const raw = Buffer.from(message.data, "base64").toString("utf8");
  const event = JSON.parse(raw);
  console.log("PING worker received event:", event);
};
