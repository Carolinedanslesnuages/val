/**
 * Reads Claude Code's local logs (~/.claude/projects/**.jsonl).
 *
 * Only COUNTERS are read: date, working folder, model and token counts.
 * The content of the conversations is never extracted nor kept.
 *
 * Claude Code writes a single answer over several lines (one per content block) with the same
 * message id: answers are deduplicated by id, keeping the largest counters.
 */
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const HOME = homedir();

/** Readable working folder: "~/project/subfolder" rather than a bare name, often ambiguous (api, front…). */
export function projectName(workingFolder) {
  if (!workingFolder) return '(inconnu)';
  if (workingFolder === HOME) return '~';
  return workingFolder.startsWith(HOME + '/') ? '~' + workingFolder.slice(HOME.length) : workingFolder;
}

/** Every .jsonl file in a folder, subfolders included, modified since `since`. */
export async function logFiles(folder, since) {
  const found = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        if (since) {
          const { mtime } = await stat(path);
          if (mtime < since) continue; // nothing recent inside
        }
        found.push(path);
      }
    }
  }
  await walk(folder);
  return found.sort();
}

const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** Extracts the usage of a log line, or null when the line carries none. */
export function usageFromLine(line) {
  // Quick filter before parsing JSON: most lines are not answers.
  if (!line.includes('"assistant"') || !line.includes('"usage"')) return null;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  const message = entry && entry.message;
  if (entry.type !== 'assistant' || !message || typeof message !== 'object' || !message.usage) return null;
  const usage = message.usage;
  return {
    messageId: message.id || entry.requestId || entry.uuid || null,
    date: entry.timestamp ? new Date(entry.timestamp) : null,
    project: projectName(entry.cwd),
    model: message.model || '(inconnu)',
    inputTokens: toNumber(usage.input_tokens) + toNumber(usage.cache_read_input_tokens) + toNumber(usage.cache_creation_input_tokens),
    outputTokens: toNumber(usage.output_tokens),
  };
}

/**
 * Reads the logs and returns deduplicated usages within [since, until).
 * @param {string[]} files
 * @param {{ since?: Date, until?: Date }} period
 */
export async function readUsages(files, { since, until } = {}) {
  const byId = new Map();
  const withoutId = [];
  for (const file of files) {
    const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of lines) {
      const usage = usageFromLine(line);
      if (!usage || !usage.date || Number.isNaN(usage.date.getTime())) continue;
      if (since && usage.date < since) continue;
      if (until && usage.date >= until) continue;
      if (usage.model === '<synthetic>') continue; // messages produced by Claude Code itself, without a model call
      if (!usage.messageId) {
        withoutId.push(usage);
        continue;
      }
      const known = byId.get(usage.messageId);
      if (!known) byId.set(usage.messageId, usage);
      else {
        known.inputTokens = Math.max(known.inputTokens, usage.inputTokens);
        known.outputTokens = Math.max(known.outputTokens, usage.outputTokens);
      }
    }
  }
  return [...byId.values(), ...withoutId];
}
