import * as core from "@actions/core";

export const config = {
  github: {
    token: core.getInput("GITHUB_TOKEN"),
  },
  openai: {
    apiKey: core.getInput("OPENAI_API_KEY"),
    model: core.getInput("OPENAI_API_MODEL"),
    queryConfig: {
      temperature: 0.2,
      max_tokens: 700,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    },
  },
  telegram: {
    botToken: core.getInput("TELEGRAM_BOT_TOKEN"),
    chatId: core.getInput("TELEGRAM_CHAT_ID"),
  },
  bot: {
    name: core.getInput("BOT_NAME") || "Code Review Bot",
  },
  excludePatterns: core
    .getInput("exclude")
    .split(",")
    .map((s) => s.trim()),
};
