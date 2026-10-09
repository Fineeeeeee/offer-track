import type { Interview, Job } from '../types';

export function calculateMetrics(jobs: Job[], interviews: Interview[]) {
  const jobIds = new Set(jobs.map((job) => job.id));
  const interviewedJobIds = new Set(
    interviews.map((interview) => interview.jobId).filter((jobId) => jobIds.has(jobId)),
  );
  const applied = jobs.filter((job) =>
    ['applied', 'responded', 'interviewing', 'offered', 'ended'].includes(job.status) || interviewedJobIds.has(job.id),
  ).length;
  const responded = jobs.filter((job) =>
    ['responded', 'interviewing', 'offered'].includes(job.status) || interviewedJobIds.has(job.id),
  ).length;
  const offered = jobs.filter((job) => job.status === 'offered').length;
  const ended = jobs.filter((job) => job.status === 'ended').length;
  const interviewCount = interviewedJobIds.size;

  return {
    applied,
    responded,
    interviewCount,
    offered,
    ended,
    replyRate: applied ? Math.round((responded / applied) * 100) : 0,
    interviewRate: applied ? Math.round((interviewCount / applied) * 100) : 0,
    offerRate: applied ? Math.round((offered / applied) * 100) : 0,
  };
}
