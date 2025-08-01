import * as Log4js from "log4js";

Log4js.configure({
  appenders: {
    out: { type: "stdout" },
  },
  categories: {
    default: { appenders: ["out"], level: "info" },
  },
});

const logger = Log4js.getLogger();

export default logger;
