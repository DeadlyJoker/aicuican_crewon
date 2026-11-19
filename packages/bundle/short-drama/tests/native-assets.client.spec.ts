/** Asset workbench actions retain the native production owner and current project. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { en } from '../src/client/locales.ts'

const source = readFileSync(new URL('../studio/native-assets.js', import.meta.url), 'utf8')
const workbench = readFileSync(new URL('../studio/reference-workbench.js', import.meta.url), 'utf8')
const card = workbench.slice(workbench.indexOf('function referenceWorkbenchAssetCard('), workbench.indexOf('function referenceWorkbenchAssets('))

function runtime() {
  const fields = {
    'ref-wb-asset-name': { value: 'Changed girl', readOnly: false },
    'ref-wb-asset-description': { value: 'New saved prompt', readOnly: false },
    'ref-wb-asset-error': { textContent: '' },
  }
  const saveButton = { disabled: false }, listeners = new Map<string, ((event: object) => void)[]>()
  const post = vi.fn(), run = vi.fn(), toast = vi.fn(), draw = vi.fn(), parent = {}
  const context = { studioNativePost: post, studioNativeRun: run, toast, referenceDrawWorkbench: draw,
    referenceRememberWorkbenchScroll: vi.fn(), render: vi.fn(), persist: vi.fn(), parent,
    assetCopy: { configureImage: en.assetConfigureImage, services: en.serviceSettings, generate: en.generate,
      importUnavailable: en.assetImportUnavailable, voiceSettings: en.voiceService, voiceUsesProject: en.assetVoiceUsesProject,
      reviewAdopted: en.assetReviewAdopted, reviewCandidate: en.assetReviewCandidate, generating: en.assetGenerating,
      generatePending: en.assetGeneratePending, generateFor: en.assetGenerateFor, generateRequest: en.assetGenerateRequest,
      generateBatchRequest: en.assetGenerateBatchRequest, reparse: en.assetReparse,
      requiredFields: en.assetRequiredFields, promptLimit: en.assetPromptLimit, referenceUnsupported: en.assetReferenceUnsupported,
      variantsViaAgent: en.assetVariantsViaAgent, referenced: en.assetReferenced,
      saved: en.assetSavedToProject, removed: en.assetRemovedFromProject, batchDelete: en.assetBatchDelete },
    studioRandomUUID: () => '25e0acfc-a63f-4bca-99c6-0f2acced255d',
    window: { addEventListener: (name: string, handler: (event: object) => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), handler])
    } },
    document: { createElement: () => ({ textContent: '' }), head: { append: vi.fn() },
      querySelector: (selector: string) => selector === '[data-wb-asset-save]' ? saveButton : null,
      getElementById: (id: keyof typeof fields) => fields[id] },
  }
  runInNewContext(`
    var S={project:'Demo',nodes:[{id:'asset:girl',kind:'character',title:'Girl',prompt:'Old prompt',nativeRevision:1,candidates:[],referenceOnly:true}],clips:['shot:first','shot:second'],edges:[]};
    var studioNativeConfig={project:{id:'project-1'},assetCopy,production:{revision:4,settings:{image:{model:'actual-image-v2'}},jobs:[],assets:[{id:'girl',kind:'character',name:'Girl',prompt:'Old prompt',version:1}],shots:[{id:'first',title:'One',assetIds:['girl']},{id:'second',title:'Two',assetIds:['girl']}]}};
    var studioNativePendingRequests=new Map();
    var referenceWorkbenchAssetEditor={id:'asset:girl',project:'Demo',creating:false,category:'character',initial:{}};
    function referenceAssetShotLabels(){return []}
    function referenceAssetImageModelPicker(){return 'Demo model'}
    function referenceImageParametersHtml(){return 'Demo parameters'}
    function referenceWorkbenchAssets(){return referenceAssetImageModelPicker({})+referenceImageParametersHtml({},'assets')+'<button disabled>重新解析资产</button><button class="ref-wb-generate-disabled" disabled>生成主角色、场景和道具图</button>'}
    function referenceOpenWorkbenchAsset(){}
    function referenceRunNodeCommand(){}
    function referenceDeleteCanvasBatch(){return {ok:true}}
    function referenceAssetVariantLabel(){return 'Main character'}
    function studioAdoptedCandidate(node){return node.candidates.find(item=>item.id===node.adoptedCandidateId)}
    function nodeById(id){return S.nodes.find(node=>node.id===id)}
    function studioScriptNode(){return null}
    function referenceCloseWorkbenchAsset(){referenceWorkbenchAssetEditor=null}
    function esc(value){return String(value)}
    function I(){return '<svg></svg>'}
    function handleAction(){}
  ` + card + '\n' + source, context)
  const evaluate = (code: string): unknown => runInNewContext(code, context)
  const message = (value: object) => { for (const handler of listeners.get('message') ?? []) handler({ source: parent, data: { channel: 'crewon-studio-v1', ...value } }) }
  return { evaluate, post, run, draw, fields, saveButton, message, toast }
}

it('shows the actual model and native shot references, without the Demo generation controls', () => {
  const { evaluate } = runtime()
  expect(evaluate("referenceAssetShotLabels(S,null,'asset:girl')")).toEqual(['01', '02'])
  const html = evaluate('referenceWorkbenchAssets(null)')
  expect(html).toContain('actual-image-v2')
  expect(html).toContain('data-action="settings"')
  expect(html).not.toContain('Demo')
  const result = evaluate("referenceWorkbenchAssetCard(null,S.nodes[0],{assetCategory:'character',assetScope:'all'})")
  expect(result).toContain('native-generate-asset:asset:girl')
  expect(result).toContain('分镜：01、02')
  expect(result).not.toContain('当前为样式 Demo')
  expect(result).toContain(en.assetImportUnavailable)
})

it('renders generation progress in the asset image without replacing the saved definition', () => {
  const { evaluate } = runtime()
  evaluate("studioNativeConfig.production.jobs=[{targetType:'asset',targetId:'girl',targetVersion:1,state:'running'}]")
  expect(evaluate("referenceWorkbenchAssetCard(null,S.nodes[0],{assetCategory:'character',assetScope:'all'})")).toContain('native-generation-spinner')
  expect(evaluate('S.nodes[0].prompt')).toBe('Old prompt')
})

it('submits one revision-checked save and retains the edit on failure', () => {
  const { evaluate, post, fields, saveButton, message } = runtime()
  evaluate('studioNativeSubmitAsset();studioNativeSubmitAsset()')
  expect(post).toHaveBeenCalledOnce()
  expect(post).toHaveBeenCalledWith('save-asset', { requestId: '25e0acfc-a63f-4bca-99c6-0f2acced255d', revision: 4,
    asset: { id: 'girl', kind: 'character', name: 'Changed girl', prompt: 'New saved prompt' } })
  expect(evaluate('S.nodes[0].prompt')).toBe('Old prompt')
  expect(saveButton.disabled).toBe(true)
  expect(fields['ref-wb-asset-description'].readOnly).toBe(true)
  message({ type: 'asset-save-failed', requestId: '25e0acfc-a63f-4bca-99c6-0f2acced255d', message: 'Save failed' })
  expect(fields['ref-wb-asset-description'].value).toBe('New saved prompt')
  expect(fields['ref-wb-asset-error'].textContent).toBe('Save failed')
  expect(saveButton.disabled).toBe(false)
  expect(fields['ref-wb-asset-description'].readOnly).toBe(false)
})

it('rejects a late save reply from a different project', () => {
  const { evaluate, message, toast } = runtime()
  evaluate("studioNativeSubmitAsset();studioNativeConfig.project.id='project-2'")
  message({ type: 'asset-saved', requestId: '25e0acfc-a63f-4bca-99c6-0f2acced255d', assetId: 'girl' })
  expect(evaluate('referenceWorkbenchAssetEditor.id')).toBe('asset:girl')
  expect(toast).not.toHaveBeenCalled()
})

it('does not write a failed save into a newly opened editor', () => {
  const { evaluate, message, fields, toast } = runtime()
  evaluate("studioNativeSubmitAsset();referenceWorkbenchAssetEditor={id:'asset:another',project:'Demo'}")
  message({ type: 'asset-save-failed', requestId: '25e0acfc-a63f-4bca-99c6-0f2acced255d', message: 'Save failed' })
  expect(fields['ref-wb-asset-error'].textContent).toBe('')
  expect(toast).toHaveBeenCalledWith('Save failed')
})

it('clears the submitted prompt draft while retaining a newer prompt entered during saving', () => {
  const first = runtime()
  first.evaluate("S.nodeDrafts={'asset:girl':{prompt:'Old draft',creationRatio:'16:9'}};studioNativeSubmitAsset()")
  first.message({ type: 'asset-saved', requestId: '25e0acfc-a63f-4bca-99c6-0f2acced255d', assetId: 'girl' })
  expect(first.evaluate("S.nodeDrafts['asset:girl']")).toEqual({ creationRatio: '16:9' })
  const next = runtime()
  next.evaluate("S.nodeDrafts={'asset:girl':{prompt:'Old draft'}};studioNativeSubmitAsset();S.nodeDrafts['asset:girl'].prompt='Newer draft'")
  next.message({ type: 'asset-saved', requestId: '25e0acfc-a63f-4bca-99c6-0f2acced255d', assetId: 'girl' })
  expect(next.evaluate("S.nodeDrafts['asset:girl'].prompt")).toBe('Newer draft')
})

it('blocks removal of referenced assets and delegates unreferenced deletion to the Host', () => {
  const { evaluate, post, toast } = runtime()
  evaluate("studioNativeRemoveAsset('asset:girl')")
  expect(post).not.toHaveBeenCalled()
  expect(toast).toHaveBeenCalledWith(en.assetReferenced)
  evaluate("studioNativeConfig.production.shots=[];studioNativeRemoveAsset('asset:girl')")
  expect(post).toHaveBeenCalledWith('remove-asset', { requestId: '25e0acfc-a63f-4bca-99c6-0f2acced255d', revision: 4, assetId: 'girl' })
  expect(evaluate('S.nodes.length')).toBe(1)
  expect(evaluate("referenceDeleteCanvasBatch(S,['asset:girl','manual'])")).toEqual({ ok: false, error: en.assetBatchDelete })
})

it('sends asset generation to the project Agent with a compact user label', () => {
  const { evaluate, run, draw } = runtime()
  evaluate("handleAction('native-generate-asset:asset:girl')")
  expect(run).toHaveBeenCalledWith(en.assetGenerateRequest, expect.objectContaining({ id: 'asset:girl' }), 'Generate image for Girl')
  expect(draw).toHaveBeenCalledWith({ focus: false })
})
