import { CronJob } from "cron";
import http from "node:http";
import https from "node:https";

// every 14 minutes send a GET request to the server to keep it awake
const job = new CronJob("*/14 * * * *", () => {
      const base = process.env.FRONTEND_URL;
      if (!base) return;
      const url = new URL("/health", base).href;
      const client = url.startsWith("https") ? https : http;

      client.get(url, (res) => {
            if (res.statusCode === 200)
                  console.log("GET request sent successful");
            else console.log("GET request failed", res.statusCode);
      })
      .on("error", (e) => console.error("Error occurred while sending request:", e))
});

export default job;