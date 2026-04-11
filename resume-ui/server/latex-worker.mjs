import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  cleanupLatexArtifacts,
  compileLatexWithRetries,
  ensureWorkspaceDirs,
  getAppEnv,
  getDbClientsOrThrow,
  getLatexExecutionMode,
  getPaths,
  getUserSettings,
  resolveProviderCredential
} from './api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '..');

const env = getAppEnv(repoRoot);
const workerId = process.env.LATEX_WORKER_ID || `${os.hostname()}-${process.pid}`;
const pollMs = Number.parseInt(process.env.LATEX_WORKER_POLL_MS || '4000', 10);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimNextJob(admin) {
  const { data: jobs, error } = await admin
    .from('generation_jobs')
    .select('id, user_id, source, artifact_base_name, tex_file_name, pdf_file_name, status, attempt_count, max_attempts')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw new Error(error.message || 'Failed to poll generation jobs.');
  const nextJob = jobs?.[0];
  if (!nextJob) return null;

  const now = new Date().toISOString();
  const { data: claimedRows, error: claimError } = await admin
    .from('generation_jobs')
    .update({
      status: 'running',
      worker_id: workerId,
      attempt_count: (nextJob.attempt_count || 0) + 1,
      started_at: now,
      updated_at: now,
      error_message: ''
    })
    .eq('id', nextJob.id)
    .eq('status', 'queued')
    .select('id, user_id, source, artifact_base_name, tex_file_name, pdf_file_name, status, attempt_count, max_attempts')
    .limit(1);

  if (claimError) throw new Error(claimError.message || 'Failed to claim generation job.');
  return claimedRows?.[0] || null;
}

async function markJob(admin, jobId, patch) {
  const { error } = await admin
    .from('generation_jobs')
    .update({
      ...patch,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);
  if (error) throw new Error(error.message || 'Failed to update generation job.');
}

async function processJob(admin, job) {
  const paths = getPaths(repoRoot, job.user_id);
  ensureWorkspaceDirs(paths);

  const settings = await getUserSettings(paths, env, job.user_id);
  const apiKey = await resolveProviderCredential(paths, env, job.user_id, settings.provider);
  const compileResult = await compileLatexWithRetries({
    workingDir: paths.texDir,
    fileName: job.tex_file_name,
    providerId: settings.provider,
    apiKey,
    model: settings.selectedModel,
    maxAttempts: job.max_attempts || 3,
    allowRepair: true,
    statusPrefix: `Worker compiling ${job.artifact_base_name}`
  });

  const baseName = String(job.tex_file_name || '').replace(/\.tex$/i, '');
  const finalPdfPath = path.join(paths.pdfDir, job.pdf_file_name);

  if (!compileResult.success || !fs.existsSync(compileResult.pdfPath)) {
    cleanupLatexArtifacts(paths.texDir, baseName);
    await markJob(admin, job.id, {
      status: 'failed',
      repaired: Boolean(compileResult.repaired),
      error_message: compileResult.output || 'Failed to compile LaTeX job.',
      completed_at: new Date().toISOString()
    });
    return;
  }

  if (compileResult.pdfPath !== finalPdfPath) {
    if (fs.existsSync(finalPdfPath)) {
      fs.unlinkSync(finalPdfPath);
    }
    fs.renameSync(compileResult.pdfPath, finalPdfPath);
  }
  cleanupLatexArtifacts(paths.texDir, baseName);

  await markJob(admin, job.id, {
    status: 'completed',
    repaired: Boolean(compileResult.repaired),
    error_message: '',
    completed_at: new Date().toISOString()
  });
}

async function main() {
  if (getLatexExecutionMode(env) !== 'worker') {
    console.log('LATEX_QUEUE_MODE is not set to worker. Exiting latex worker.');
    return;
  }

  const { admin } = await getDbClientsOrThrow(env);
  console.log(`LaTeX worker ${workerId} polling every ${pollMs}ms`);

  while (true) {
    try {
      const job = await claimNextJob(admin);
      if (!job) {
        await sleep(pollMs);
        continue;
      }
      console.log(`Claimed job ${job.id} for ${job.artifact_base_name}`);
      await processJob(admin, job);
    } catch (error) {
      console.error(error.message || error);
      await sleep(pollMs);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
