// Real telemetry, measured from the engine's own store on 2026-08-19.
//
// Source: postgresql://…/agent_engine_v1 — the queries that produced every
// number are kept beside it so a later reading can be compared to this one
// rather than guessed at. Nothing here is invented, and nothing is rounded in
// a direction that flatters the engine.
//
// These are constants for now. The screen reads them through this module, so
// swapping in a live reader later changes this file and nothing that draws.

export type SystemId = 'database' | 'tools' | 'llm' | 'memory' | 'execution';

export type SystemCheck = {
  id: SystemId;
  label: string;
  // What the check found, shown once it passes.
  detail: string;
  // Real elapsed time of the query behind it, in milliseconds.
  elapsedMs: number;
  // 0..1, drives the meter. A check that is simply "up" reports 1.
  level: number;
};

// select relname, n_live_tup from pg_stat_user_tables where n_live_tup > 0;
export const systems: SystemCheck[] = [
  {id: 'database', label: 'DATABASE', detail: '28 tables · pgvector', elapsedMs: 12, level: 1},
  {id: 'tools', label: 'TOOLS', detail: '21 registered', elapsedMs: 1, level: 1},
  {id: 'llm', label: 'LLM', detail: '13,919 calls recorded', elapsedMs: 8, level: 1},
  {id: 'memory', label: 'MEMORY', detail: '1,002 memories · 464 vectors', elapsedMs: 5, level: 1},
  {id: 'execution', label: 'EXECUTION', detail: '1,319 goals · 1,082 workers', elapsedMs: 5, level: 1}
];

export type Vital = {
  label: string;
  caption: string;
  percent: number;
  // The count the percentage was taken over, so the ring is never a bare number.
  basis: string;
};

// select round(100.0*sum(case when success then 1 else 0 end)/count(*),1) from tool_calls;
// select round(100.0*sum(case when status='completed' then 1 else 0 end)/count(*),1) from goals;
// select round(100.0*count(distinct goal_id)/(select count(*) from goals),1) from retry_history;
export const vitals: Vital[] = [
  {label: 'TOOL', caption: 'SUCCESS', percent: 66.9, basis: '10,413 calls'},
  {label: 'GOAL', caption: 'COMPLETION', percent: 72.3, basis: '1,319 goals'},
  {label: 'RETRY', caption: 'RATE', percent: 11.1, basis: '233 retries'}
];

export type ToolStat = {name: string; success: number; calls: number; medianMs: number};

// select tool_name, count(*), success rate, median duration from tool_calls
// group by tool_name order by count(*) desc;
export const toolMatrix: ToolStat[] = [
  {name: 'bash', success: 35, calls: 3779, medianMs: 0},
  {name: 'execute_code', success: 84, calls: 1640, medianMs: 208},
  {name: 'read_file', success: 94, calls: 1483, medianMs: 2},
  {name: 'run_artifact', success: 75, calls: 1247, medianMs: 55},
  {name: 'write_file', success: 98, calls: 876, medianMs: 24},
  {name: 'run_tests', success: 96, calls: 433, medianMs: 204}
];

export type Figure = {value: number; unit: string};

export const record: Figure[] = [
  {value: 80_197_913, unit: 'tokens'},
  {value: 44_299, unit: 'artifacts'},
  {value: 10_416, unit: 'tool calls'}
];

// The loudest thing in the data: bash is 36% of every tool call the engine has
// ever made, and fails roughly two times in three. Derived, not authored — the
// screen states it because the numbers above say it.
export const verdict = 'bash carries 36% of all tool calls at a 35% success rate';

export const latency = {toolP50: 19, toolP95: 1311, llmP50: 2291, llmP95: 25067};
