import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

function n(v, fallback = 0) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

async function readJson(filePath, fallback) {
  try {
    await fsPromises.access(filePath);
    const content = await fsPromises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

export async function collectCorrelationData({ messagesPath, customEventsPath, cutoffMs }) {
  const sessions = new Set();
  const model = new Map();
  const skill = new Map();
  const tool = new Map();
  const agent = new Map();
  const termination = new Map();
  const modelTokens = new Map();
  const skillTokens = new Map();
  const toolTokens = new Map();
  const loopsBySession = new Map();
  const perMessageTokens = [];

  let totalMessages = 0;
  let delegatedMessages = 0;
  let traces = 0;
  let parentSpans = 0;
  let errorMentions = 0;
  let signedCustomEvents = 0;
  let validSignedCustomEvents = 0;
  let withTokens = 0;
  let inTok = 0;
  let outTok = 0;
  let totalTok = 0;

  let messagesPathExists = false;
  try {
    await fsPromises.access(messagesPath);
    messagesPathExists = true;
  } catch {
    messagesPathExists = false;
  }

  if (messagesPathExists) {
    const entries = await fsPromises.readdir(messagesPath);
    const dirs = [];
    for (const entry of entries) {
      try {
        const stat = await fsPromises.stat(path.join(messagesPath, entry));
        if (stat.isDirectory() && stat.mtimeMs >= cutoffMs) {
          dirs.push(entry);
        }
      } catch {
        // skip entries that can't be stat'd
      }
    }

    for (const sessionId of dirs) {
      sessions.add(sessionId);
      let maxLoop = 0;
      const allFiles = await fsPromises.readdir(path.join(messagesPath, sessionId));
      const files = allFiles.filter((fileName) => fileName.endsWith('.json'));
      for (const fileName of files) {
        try {
          const content = await fsPromises.readFile(path.join(messagesPath, sessionId, fileName), 'utf-8');
          const raw = JSON.parse(content);
          totalMessages += 1;
          const a = String(raw?.agent || '').trim();
          if (a) {
            agent.set(a, (agent.get(a) || 0) + 1);
            if (!/^(main|assistant|system)$/i.test(a)) delegatedMessages += 1;
          }
          const m = typeof raw?.model === 'string' ? raw.model : String(raw?.model?.modelID || raw?.model?.id || '').trim();
          if (m) model.set(m, (model.get(m) || 0) + 1);
          const messageSkills = arr(raw?.skills)
            .map((item) => (typeof item === 'string' ? item : String(item?.name || item?.id || '').trim()))
            .filter(Boolean);
          for (const id of messageSkills) {
            skill.set(id, (skill.get(id) || 0) + 1);
          }

          const messageTools = arr(raw?.tools)
            .map((item) => (typeof item === 'string' ? item : String(item?.name || item?.id || '').trim()))
            .filter(Boolean);
          for (const id of messageTools) {
            tool.set(id, (tool.get(id) || 0) + 1);
          }
          if (raw?.trace_id || raw?.traceId || raw?.traceID) traces += 1;
          if ((raw?.span_id || raw?.spanId) && (raw?.parent_span_id || raw?.parentSpanId)) parentSpans += 1;

          const usage = raw?.usage || raw?.tokenUsage || {};
          const input = n(usage?.input_tokens ?? usage?.inputTokens ?? raw?.input_tokens ?? raw?.prompt_tokens, 0);
          const output = n(usage?.output_tokens ?? usage?.outputTokens ?? raw?.output_tokens ?? raw?.completion_tokens, 0);
          const total = n(usage?.total_tokens ?? usage?.totalTokens ?? raw?.total_tokens, input + output);
          if (total > 0) {
            withTokens += 1;
            inTok += input;
            outTok += output;
            totalTok += total;
            perMessageTokens.push(total);
            if (m) modelTokens.set(m, (modelTokens.get(m) || 0) + total);

            const skillTokenShare = messageSkills.length > 0 ? total / messageSkills.length : 0;
            const toolTokenShare = messageTools.length > 0 ? total / messageTools.length : 0;
            for (const name of messageSkills) {
              skillTokens.set(name, (skillTokens.get(name) || 0) + skillTokenShare);
            }
            for (const name of messageTools) {
              toolTokens.set(name, (toolTokens.get(name) || 0) + toolTokenShare);
            }
          }

          const loopIndex = Math.max(n(raw?.iteration_index, 0), n(raw?.iterationIndex, 0), n(raw?.loopIndex, 0), n(raw?.attempt, 0));
          const hasLoopKeyword = /\b(loop|retry|replan|iterate|attempt)\b/.test(JSON.stringify(raw).toLowerCase());
          if (loopIndex > 0 || hasLoopKeyword) maxLoop = Math.max(maxLoop, loopIndex > 0 ? loopIndex : 1);

          const reason = String(raw?.termination_reason || raw?.terminationReason || raw?.finish_reason || raw?.stop_reason || '').trim();
          if (reason) termination.set(reason, (termination.get(reason) || 0) + 1);
          if (/\b(error|failed|exception|timeout|denied|unreachable)\b/.test(JSON.stringify(raw).toLowerCase())) errorMentions += 1;
        } catch {
          // ignore malformed records
        }
      }
      loopsBySession.set(sessionId, maxLoop);
    }
  }

  const customEventsData = await readJson(customEventsPath, { events: [] });
  const customEvents = (customEventsData.events || []).filter((event) => {
    if (!event.timestamp) return true;
    const ts = Date.parse(event.timestamp);
    return Number.isNaN(ts) || ts >= cutoffMs;
  });

  for (const event of customEvents) {
    if (event.trace_id) traces += 1;
    if (event.span_id && event.parent_span_id) parentSpans += 1;
    if (event.model) model.set(event.model, (model.get(event.model) || 0) + 1);
    if (event.skill) skill.set(event.skill, (skill.get(event.skill) || 0) + 1);
    if (event.tool) tool.set(event.tool, (tool.get(event.tool) || 0) + 1);

    const customTotal = n(event.total_tokens, n(event.input_tokens, 0) + n(event.output_tokens, 0));
    if (customTotal > 0) {
      withTokens += 1;
      inTok += n(event.input_tokens, 0);
      outTok += n(event.output_tokens, 0);
      totalTok += customTotal;
      perMessageTokens.push(customTotal);
      if (event.model) modelTokens.set(event.model, (modelTokens.get(event.model) || 0) + customTotal);
      if (event.skill) skillTokens.set(event.skill, (skillTokens.get(event.skill) || 0) + customTotal);
      if (event.tool) toolTokens.set(event.tool, (toolTokens.get(event.tool) || 0) + customTotal);
    }

    if (event.termination_reason) {
      termination.set(event.termination_reason, (termination.get(event.termination_reason) || 0) + 1);
    }

    const signature = String(event?.provenance?.signature || '').trim();
    if (signature) {
      signedCustomEvents += 1;
      if (event?.provenance?.signature_valid === true) {
        validSignedCustomEvents += 1;
      }
    }
  }

  return {
    sessions,
    model,
    skill,
    tool,
    agent,
    termination,
    modelTokens,
    skillTokens,
    toolTokens,
    loopsBySession,
    perMessageTokens,
    totalMessages,
    delegatedMessages,
    traces,
    parentSpans,
    errorMentions,
    signedCustomEvents,
    validSignedCustomEvents,
    withTokens,
    inTok,
    outTok,
    totalTok,
    customEvents,
  };
}
