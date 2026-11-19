/** Isolated qualification host: official editor, API, compiler and producer; no CrewON project access. */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { bundleToSingleHtml } from '@hyperframes/core/compiler';
import { getHyperframeRuntimeScript } from '@hyperframes/core/runtime-script';
import { lintHyperframeHtml, lintProject } from '@hyperframes/lint';
import { createStudioApi, PREVIEW_BUNDLE_OPTIONS, historyCache, openProjectHistory,
  createStudioManualEditsRenderBodyScript, createStudioMotionRenderBodyScript } from '@hyperframes/studio-server';
import { createRenderJob, executeRenderJob } from '@hyperframes/producer';

export const name = 'crewon-hyperframes-editor-check';

/** Start only through the accompanying dsh profile patch; dispose HTTP and render work together. */
export async function apply(ctx, config) {
  if (config.host !== '127.0.0.1' || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535)
    throw new Error('Editor qualification requires a loopback host and valid unprivileged port');
  const base = dirname(fileURLToPath(import.meta.url));
  const projectDir = resolve(base, config.projectDir);
  if (projectDir !== resolve(base, 'project')) throw new Error('Only the owned qualification project is allowed');
  const project = { id: 'crewon-editor-check', dir: projectDir, title: 'CrewON · 自制媒体资格验证' };
  const studioDir = dirname(fileURLToPath(import.meta.resolve('@hyperframes/studio')));
  const origin = `http://${config.host}:${config.port}`;
  const histories = historyCache(dir => openProjectHistory({ projectDir: dir, historyRoot: resolve(base, config.historyDir) }));
  const jobs = new Set();
  const adapter = {
    listProjects: () => [project],
    resolveProject: id => id === project.id ? project : null,
    history: p => histories.get(p.dir),
    bundle: async (dir, options) => (await bundleToSingleHtml(dir, { ...PREVIEW_BUNDLE_OPTIONS, ...options }))
      .replace('data-hyperframes-preview-runtime="1" src=""', 'data-hyperframes-preview-runtime="1" src="/api/runtime.js"'),
    lint: (html, options) => lintHyperframeHtml(html, { ...options, host: 'studio' }),
    lintProject: dir => lintProject(dir, undefined, { host: 'studio' }),
    runtimeUrl: '/api/runtime.js',
    serverOrigin: () => origin,
    rendersDir: p => resolve(p.dir, 'renders'),
    startRender(options) {
      const controller = new AbortController();
      const state = { id: options.jobId, status: 'rendering', progress: 0, outputPath: options.outputPath,
        cancel: () => controller.abort() };
      const job = createRenderJob({ fps: options.fps, format: options.format, quality: options.quality,
        entryFile: options.composition, outputResolution: options.outputResolution,
        variables: options.variables, renderBodyScripts: [createStudioManualEditsRenderBodyScript(projectDir), createStudioMotionRenderBodyScript(projectDir)].filter(Boolean) });
      const running = executeRenderJob(job, projectDir, options.outputPath, update => {
        state.progress = update.progress; state.stage = update.currentStage;
      }, controller.signal).then(() => {
        state.status = controller.signal.aborted ? 'cancelled' : 'complete';
        if (state.status === 'complete') state.progress = 100;
      }).catch(error => {
        state.status = controller.signal.aborted ? 'cancelled' : 'failed'; state.error = error.message;
      }).finally(() => jobs.delete(owned));
      const owned = { controller, running }; jobs.add(owned);
      return state;
    },
  };
  await ctx.effect(async () => {
    const app = new Hono();
    app.get('/api/runtime.js', c => c.body(getHyperframeRuntimeScript(), 200, { 'content-type': 'text/javascript' }));
    app.route('/api', createStudioApi(adapter, { allowedHosts: [`${config.host}:${config.port}`] }));
    app.use('/assets/*', serveStatic({ root: studioDir }));
    app.get('*', async c => {
      if (c.req.path.startsWith('/api/')) return c.json({ error: 'Unsupported qualification endpoint' }, 404);
      if (/\.[a-z0-9]+$/i.test(c.req.path)) return c.notFound();
      return c.html(await readFile(resolve(studioDir, 'index.html'), 'utf8'));
    });
    let server;
    await new Promise((ready, reject) => {
      server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, ready);
      server.once('error', reject);
    });
    console.error(`HyperFrames editor qualification: ${origin}`);
    return async () => {
      for (const job of jobs) job.controller.abort();
      await Promise.all([...jobs].map(job => job.running));
      await histories.closeAll();
      server.closeAllConnections();
      await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
    };
  });
}
