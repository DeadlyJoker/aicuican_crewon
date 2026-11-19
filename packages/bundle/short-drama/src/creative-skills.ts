/** Studio skills use the native registry and project workspace selection. */
import { join, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { BUNDLED_SKILL_RANK, type SkillCandidate } from '@deepseek-ai/dsh-skill'
import type { DirectorStage } from './director-model.ts'
import type { ShortDramaProjects } from './projects.ts'

const workflow = 'Read short_drama_read_script and short_drama_read_production first. These tools own project data. Never create a second CSV or Python task ledger. Load a specialist skill only when needed. Use native save tools to turn your output into project records and canvas nodes; prose alone is not a delivery. Preserve adopted scripts, asset versions, candidates and prior jobs. Diagnose before rewriting. Continue authorized work from unmet dependencies, without repeated stage questions. Human adoption stays in the native review card or workbench. Generation completion is not visual or sound acceptance. Before editing archived videos, use short_drama_analyze_media in inspect mode to verify duration and native audio. Use scenes for candidate cuts and transcript for recognized dialogue when available; read retained results with short_drama_read_media_analysis before retrying. Never treat recognized speech as the approved screenplay, silently replace subtitles, or declare a model available without a successful result. For multitrack editing, preserve production.edit and use short_drama_save_edit. Its startFrame is a timeline position; sourceStartFrame is the source trim offset. Preserve original audio unless asked to mute it. Map confirmed source subtitles through the clip trim and timeline position before adding them. A missing remote receipt is unknown, never a reason to submit again.'
const definitions = [
  { name: 'studio-director', description: 'Studio project director: idea guidance, saved creative direction, dependency-based stage orchestration, screenplay diagnosis, asset bible, structured shots, H3 compilation, review and repair.',
    content: `${workflow}\nRead short_drama_read_direction before saving a creative brief; use directionRevision, never the production or screenplay revision. Follow the native studio-director project snapshot. From a vague idea ask at most two high-impact creative questions with recommended defaults; accept short answers. Save background, characters, conflict and outline with short_drama_save_direction before writing. End the turn after saving a direction so its native chat review card appears; never call a question tool to confirm a saved direction, screenplay or media. Question tools are only for creative preferences. Existing adopted work skips unmet early stages. Continue until a real human review or missing dependency; never make users name tools or choose skills. Use studio-script-diagnosis for script findings, studio-asset-bible for facts and variants, studio-storyboard for director plans, studio-u22-compiler before video generation, and studio-media-review for review/repair. A project may enter at any stage. Do not force every video through an extra first-frame generation; choose i2va, ref2va or t2va for the configured provider. Do not change models, LoRA, VAE or sampling to repair prose. Report a short result and leave the real records in the canvas.` },
  { name: 'studio-script-diagnosis', description: 'Diagnose an adopted screenplay with exact source quotes and scoped suggestions, preserving story facts.',
    content: `${workflow}\nDistinguish locked facts, permitted changes and unknowns. Examine protagonist intention, causal order, conflict, emotional turn, dialogue voice and production feasibility; do not force feature-film beat formulas onto a micro drama. Save a diagnosis via short_drama_save_creative with kind=diagnosis: {id:UUID,scriptId,summary,issues:[{scene,quote,severity:note|warning|blocking,problem,suggestion}]}. Quotes must occur verbatim in the adopted script. Diagnosis never edits the script; use short_drama_save_script for a separate proposed revision only when requested.` },
  { name: 'studio-asset-bible', description: 'Extract characters, scenes and props into source-linked versioned Studio assets with locked traits and state variants.',
    content: `${workflow}\nSeparate people, places and objects. Read the whole script and reuse existing identities. Save each asset with short_drama_save_asset, then save its brief using kind=asset and {id:UUID,assetId,assetVersion,scriptId,evidence,origin:explicit|inferred|designed,locked:[traits],variants:[{name,description,appliesTo}]}. Evidence is an exact script quote; invented appearance is labelled designed, never script fact. State changes such as clothing, wetness, injury, weather or lamp switches belong to variants. Approve room geometry separately from visual style. Keep descriptive prompts concrete and reusable; do not import unverified external style examples as production defaults.` },
  { name: 'studio-image-prompts', description: 'Write usable asset and shot image prompts from locked project facts and reference purposes.',
    content: `${workflow}\nBefore an image call, read the adopted script, asset brief, current prompt and actual reference images. Write the final image prompt into the native asset or shot record before generating. Character assets describe identity, age, face, hair, wardrobe and distinguishing features with a clean readable composition; do not add contact-sheet views unless requested. Scene assets specify room layout, entrances, fixed furniture and camera position; keep accepted geometry unchanged. Prop assets specify material, shape, scale and relevant state. Shot images additionally specify framing, blocking, gaze, light direction and continuity from the previous shot. Reuse the approved style instead of inventing another. Describe only visible facts; do not paste dialogue, plot summaries, JSON instructions or diagnostic notes into image prompts. Preserve the approved identity and geometry when editing a rejected candidate; change only the diagnosed defect. Save designed appearance as designed, never as a screenplay fact. Pass archived referenceMediaIds for asset edits and keep the original candidate.` },
  { name: 'studio-storyboard', description: 'Construct Studio canvas shots and versioned director plans with timed actions, exact dialogue and reference purposes.',
    content: `${workflow}\nCreate or revise each shot via short_drama_save_shot; this builds the native canvas. Then use kind=shot with {id:UUID,shotId,shotVersion,mode:i2va|ref2va|t2va,purpose,geography,camera,lighting,entryState,exitState,beats:[{start,end,action,speaker,dialogue}],references:[{assetId,assetVersion,usage:identity|scene|prop|voice}],soundscape,music}. Reference assets must be assigned to the shot. Seconds are frames/fps. Beats begin at zero, remain contiguous and finish at the exact duration. Spoken lines must match both the adopted screenplay and saved shot dialogue verbatim. Use English director descriptions for H3 and preserve Chinese dialogue. State camera-relative light and screen direction from actual scene geography; preserve prior exit state in the next entry state. Keep gestures motivated and avoid unrelated characters in reference inputs.` },
  { name: 'studio-u22-compiler', description: 'Compile and validate actual U22/H3 inputs, ordered references, dialogue and duration before execution.',
    content: `${workflow}\nCall short_drama_compile_shot after saving a structured plan. Fix every blocking finding before generation. i2va uses the adopted first frame; ref2va uses reviewed asset references with explicit purposes and needs no extra shot image; t2va uses no references and requires an appropriate configured workflow. The Host compiles base modes to integrated_multimodal_description, overall_soundscape, non_diegetic_music; Ref2VA to subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music. Do not append another lock template or diagnostic notes. Do not modify remote model settings. Use one stable jobId per attempt and query that job after interruption. A new creative input is a new attempt, not a retry of an unknown job.` },
  { name: 'studio-media-review', description: 'Record evidence-based image/video reviews and scoped repair decisions for exact archived Studio attempts.',
    content: `${workflow}\nInspect actual archived images or video frames and audio using available tools. Record reviews with kind=review: {id:UUID,jobId,reviewer,dimensions:[{dimension:identity|space|appearance|performance|sound|cut,verdict:passed|failed|unknown|not-applicable,observation}],repair,replacesJobId:UUID|null}. Never mark unheard speech passed from waveforms, ASR, or stream metadata alone. A still cannot establish motion continuity. Record source and timecode for observations. Resolve geometry, execution settings, references, encoding and prompt causes separately. A failed candidate remains in history and cannot be adopted. Repair the affected source shot or asset and its plan. For an asset image edit, pass referenceMediaIds with the archived rejected image identity to short_drama_generate_media; the configured reference-image model executes the edit. Recompile video plans, generate a new candidate and link its review to the rejected job. Do not automatically replace adopted media or the episode. Technical export verification and artistic acceptance are separate.` },
]

/**
 * Include stage-relevant specialist instructions in each logged director request.
 * @param stage - Stage derived from persisted project records.
 * @returns Native skill content for the current creative work, without requiring model discovery.
 */
export function directorStageSkills(stage: DirectorStage): string {
  const selected: Record<DirectorStage, readonly string[]> = {
    idea: ['studio-director'], direction: ['studio-director'],
    script: ['studio-script-diagnosis'], assets: ['studio-script-diagnosis', 'studio-asset-bible', 'studio-image-prompts', 'studio-media-review'],
    storyboard: ['studio-image-prompts', 'studio-storyboard', 'studio-u22-compiler'],
    video: ['studio-storyboard', 'studio-u22-compiler', 'studio-media-review'],
    edit: ['studio-media-review'], complete: ['studio-media-review'],
  }
  return definitions.filter(item => selected[stage].includes(item.name))
    .map(item => `Skill: ${item.name}\n${item.content}`).join('\n\n')
}

/**
 * Register lazy native skills only for Studio project directories.
 * @param ctx - Plugin effect scope and native skill registry.
 * @param projects - Project catalogue controlling eligible workspace directories.
 * @param root - Configured absolute Studio workspace root.
 */
export function registerCreativeSkills(ctx: Context, projects: ShortDramaProjects, root: string): void {
  const eligible = (cwd: string | undefined) => cwd !== undefined && projects.list().some((project) => {
    const path = join(root, project.id)
    return cwd === path || cwd.startsWith(path + sep)
  })
  const candidates: SkillCandidate[] = definitions.map(definition => ({
    name: definition.name, description: definition.description, provider: 'studio', source: 'bundled', rank: BUNDLED_SKILL_RANK,
    invocation: { modelInvocable: true, userInvocable: true }, locator: definition.name,
  }))
  ctx.effect(() => ctx.skills.registerProvider(() => ({
    name: 'studio',
    list: options => Promise.resolve(eligible(options.cwd) ? candidates : []),
    get: (candidate, options) => {
      const definition = definitions.find(item => item.name === candidate.name)
      return Promise.resolve(eligible(options.cwd) && definition ? { ...candidate, content: definition.content } : undefined)
    },
  })), 'Studio project creative skills')
}
