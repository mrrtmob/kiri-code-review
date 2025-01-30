import { readFileSync } from "fs";
import * as core from "@actions/core";
import OpenAI from "openai";
import { Octokit } from "@octokit/rest";
import parseDiff, { Chunk, File } from "parse-diff";
import minimatch from "minimatch";
import axios from "axios";

const GITHUB_TOKEN: string = core.getInput("GITHUB_TOKEN");
const OPENAI_API_KEY: string = core.getInput("OPENAI_API_KEY");
const OPENAI_API_MODEL: string = core.getInput("OPENAI_API_MODEL");
const BOT_NAME: string = core.getInput("BOT_NAME") || "Code Review Bot";
const TELEGRAM_BOT_TOKEN: string = core.getInput("TELEGRAM_BOT_TOKEN");
const TELEGRAM_CHAT_ID: string = core.getInput("TELEGRAM_CHAT_ID");

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

interface PRDetails {
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  description: string;
}

interface ReviewComment {
  path: string;
  line: number;
  body: string;
  position: number;
}

async function sendTelegramNotification(message: string): Promise<void> {
  try {
    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(telegramApiUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("Error sending Telegram notification:", error);
  }
}

async function getPRDetails(): Promise<PRDetails> {
  const { repository, number } = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH || "", "utf8")
  );
  const prResponse = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
  });
  return {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
    title: prResponse.data.title ?? "",
    description: prResponse.data.body ?? "",
  };
}

async function getDiff(
  owner: string,
  repo: string,
  pull_number: number
): Promise<string | null> {
  try {
    const response = await octokit.pulls.get({
      owner,
      repo,
      pull_number,
      mediaType: { format: "diff" },
    });
    return String(response.data);
  } catch (error) {
    console.error("Error getting diff:", error);
    return null;
  }
}

async function analyzeCode(
  parsedDiff: File[],
  prDetails: PRDetails
): Promise<Array<ReviewComment>> {
  const comments: Array<ReviewComment> = [];

  for (const file of parsedDiff) {
    if (file.to === "/dev/null") continue; // Ignore deleted files

    for (const chunk of file.chunks) {
      const prompt = createPrompt(file, chunk, prDetails);
      const aiResponse = await getAIResponse(prompt);

      if (aiResponse) {
        const newComments = createComment(file, chunk, aiResponse);
        if (newComments.length > 0) {
          comments.push(...newComments);
        }
      }
    }
  }

  return comments;
}

function createPrompt(file: File, chunk: Chunk, prDetails: PRDetails): string {
  return `Your task is to review pull requests. Instructions:
- Provide the response in following JSON format:  {"reviews": [{"lineNumber":  <line_number>, "reviewComment": "<review comment>"}]}
- Do not give positive comments or compliments.
- Provide comments and suggestions ONLY if there is something to improve, otherwise "reviews" should be an empty array.
- Write the comment in GitHub Markdown format.
- Use the given description only for the overall context and only comment the code.
- IMPORTANT: NEVER suggest adding comments to the code.

Review the following code diff in the file "${
    file.to
  }" and take the pull request title and description into account when writing the response.
  
Pull request title: ${prDetails.title}
Pull request description:

---
${prDetails.description}
---

Git diff to review:

\`\`\`diff
${chunk.content}
${chunk.changes
  // @ts-expect-error - ln and ln2 exists where needed
  .map((c) => `${c.ln ? c.ln : c.ln2} ${c.content}`)
  .join("\n")}
\`\`\`
`;
}

async function getAIResponse(prompt: string): Promise<Array<{
  lineNumber: string;
  reviewComment: string;
}> | null> {
  const queryConfig = {
    model: OPENAI_API_MODEL,
    temperature: 0.2,
    max_tokens: 700,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  };

  try {
    const response = await openai.chat.completions.create({
      ...queryConfig,
      // return JSON if the model supports it:
      ...(OPENAI_API_MODEL === "gpt-4o-mini"
        ? { response_format: { type: "json_object" } }
        : {}),
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
    });

    const res = response.choices[0].message?.content?.trim() || "{}";
    return JSON.parse(res).reviews;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

function createComment(
  file: File,
  chunk: Chunk,
  aiResponses: Array<{
    lineNumber: string;
    reviewComment: string;
  }>
): Array<ReviewComment> {
  return aiResponses
    .flatMap((aiResponse) => {
      if (!file.to) {
        return [];
      }

      const lineNumber = Number(aiResponse.lineNumber);

      // Find the position within the chunk
      let position = -1;
      for (let i = 0; i < chunk.changes.length; i++) {
        const change = chunk.changes[i];
        // @ts-expect-error - ln and ln2 exists where needed
        if ((change.ln || change.ln2) === lineNumber) {
          position = i + 1; // Position is 1-based
          break;
        }
      }

      if (position === -1) {
        console.log(`Could not find position for line ${lineNumber}`);
        return [];
      }

      return {
        body: `Code Review Bot:\n\n${aiResponse.reviewComment}`,
        path: file.to,
        line: lineNumber,
        position: position,
      };
    })
    .filter((comment) => comment.position > 0);
}

async function createReviewComment(
  owner: string,
  repo: string,
  pull_number: number,
  comments: Array<ReviewComment>
): Promise<void> {
  try {
    // Debug logging
    console.log(
      "Creating review with comments:",
      JSON.stringify(comments, null, 2)
    );

    const validComments = comments.filter((comment) => {
      const isValid =
        typeof comment.path === "string" &&
        comment.path.length > 0 &&
        typeof comment.position === "number" &&
        comment.position > 0 &&
        typeof comment.body === "string" &&
        comment.body.length > 0;

      if (!isValid) {
        console.log("Invalid comment:", comment);
      }

      return isValid;
    });

    if (validComments.length === 0) {
      console.log("No valid comments to submit");
      return;
    }

    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number,
      comments: validComments,
      event: "COMMENT",
    });
  } catch (error) {
    console.error("Error creating review comment:", error);
    if (error instanceof Error) {
      await sendTelegramNotification(
        `❌ Failed to create review comment: ${error.message}`
      );
      throw error;
    }
  }
}

function sanitizeText(text: string): string {
  return text
    .replace(
      /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu,
      ""
    )
    .trim();
}

async function main() {
  try {
    const prDetails = await getPRDetails();

    await sendTelegramNotification(
      `🤖 Starting code review for PR #${prDetails.pull_number}`
    );

    const eventData = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")
    );
    let diff: string | null = null;

    if (eventData.action === "opened") {
      diff = await getDiff(
        prDetails.owner,
        prDetails.repo,
        prDetails.pull_number
      );
      console.log("Got diff for opened PR");
    } else if (eventData.action === "synchronize") {
      const newBaseSha = eventData.before;
      const newHeadSha = eventData.after;
      const response = await octokit.repos.compareCommits({
        headers: {
          accept: "application/vnd.github.v3.diff",
        },
        owner: prDetails.owner,
        repo: prDetails.repo,
        base: newBaseSha,
        head: newHeadSha,
      });
      diff = String(response.data);
      console.log("Got diff for synchronized PR");
    } else {
      console.log("Unsupported event:", process.env.GITHUB_EVENT_NAME);
      return;
    }

    if (!diff) {
      console.log("No diff found");
      return;
    }

    console.log("Parsing diff...");
    const parsedDiff = parseDiff(diff);
    const excludePatterns = core
      .getInput("exclude")
      .split(",")
      .map((s) => s.trim());

    const filteredDiff = parsedDiff.filter((file) => {
      return !excludePatterns.some((pattern) =>
        minimatch(file.to ?? "", pattern)
      );
    });

    console.log(`Analyzing ${filteredDiff.length} files...`);
    const comments = await analyzeCode(filteredDiff, prDetails);

    if (comments.length > 0) {
      console.log(`Created ${comments.length} comments`);
      await createReviewComment(
        prDetails.owner,
        prDetails.repo,
        prDetails.pull_number,
        comments
      );

      const commentSummary = comments
        .map(
          (comment) =>
            `🔹 File: ${comment.path}\n` +
            `Line: ${comment.line}\n` +
            `${comment.body.replace("Code Review Bot:\n\n", "")}`
        )
        .join("\n\n");

      await sendTelegramNotification(
        `✅ Review completed with ${comments.length} suggestions:\n\n${commentSummary}`
      );
    } else {
      await sendTelegramNotification(`✅ Review completed. No issues found.`);
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", errorMessage);
    await sendTelegramNotification(`❌ Error: ${errorMessage}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
