// Egyszerű wrapper: ugyanazt csinálja, mint a sendPush
const handlerSend = require("./sendPush").handler;

exports.handler = async (event, context) => {
  return handlerSend(event, context);
};