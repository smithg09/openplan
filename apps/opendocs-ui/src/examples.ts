// Example documents offered on the documents home. Opening one copies it into the
// user's own documents (a normal document they can comment on, version and delete).
import sampleHTML from '../../cli/internal/opendocs/sample/retry-storm.html?raw';
import rfc from './examples/rfc-rate-limiting.html?raw';
import pr from './examples/pr-redis-sessions.html?raw';
import report from './examples/weekly-growth-report.html?raw';
import plan from './examples/launch-plan.html?raw';

export interface Example { slug: string; title: string; kind: string; html: string }

export const EXAMPLES: Example[] = [
  { slug: 'retry-storm', title: 'How a retry storm took down checkout', kind: 'Postmortem', html: sampleHTML },
  { slug: 'rfc-rate-limiting', title: 'RFC: Rate limiting for the public API', kind: 'Spec', html: rfc },
  { slug: 'pr-redis-sessions', title: 'PR #482: Move sessions to Redis', kind: 'Pull request', html: pr },
  { slug: 'weekly-growth-report', title: 'Growth report: week 44', kind: 'Report', html: report },
  { slug: 'launch-plan', title: 'Launch plan: Q1 release', kind: 'Plan', html: plan },
];
