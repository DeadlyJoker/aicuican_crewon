/** Node browsing renders saved media consistently without changing project content. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const preview = readFileSync(new URL('../studio/node-preview.js', import.meta.url), 'utf8')
const adapter = readFileSync(new URL('../studio/native-adapter.js', import.meta.url), 'utf8')
const nativePreview = adapter.slice(adapter.indexOf('const studioNativeBasePreview='), adapter.indexOf('rememberProject='))
const navigation = readFileSync(new URL('../studio/canvas-navigation.js', import.meta.url), 'utf8')
const navigationList = navigation.slice(navigation.indexOf('function canvasNavigatorListHtml('), navigation.indexOf('function canvasNavigatorHtml('))
const resources = readFileSync(new URL('../studio/reference-resource-list.js', import.meta.url), 'utf8')
const resourceCard = resources.slice(resources.indexOf('function referenceResourceCard('), resources.indexOf('function referenceResourceGrid('))

function fixture() {
  const handlers = new Map<string, (event: { target: object }) => void>()
  const context = { document: { addEventListener: (type: string, handler: (event: { target: object }) => void) => {
    handlers.set(type, handler)
  } } }
  runInNewContext(`
    var S={selected:null,nodes:[]};
    var studioNativePendingRequests=new Map();
    var studioNativeConfig={production:{jobs:[]}};
    var referenceUploadUrls=new Map();
    function esc(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');}
    function I(name){return '<svg data-icon="'+name+'"></svg>';}
    function canvasNavigatorState(){return {query:'',folded:{},grid:true};}
    function canvasCurrentNavigationGroups(){return [{id:'all',title:'Project',nodes:S.nodes}];}
    function canvasFilteredNavigationGroups(groups){return groups;}
    function referenceTags(){return [];}
  ` + preview + '\n' + nativePreview + '\n' + navigationList + '\n' + resourceCard, context)
  const evaluate = (code: string): unknown => runInNewContext(code, context)
  const value = (code: string): unknown => JSON.parse(String(evaluate(`JSON.stringify(${code})`)))
  return { evaluate, value, handlers }
}

describe('shared node previews', () => {
  it('renders the adopted video directly rather than a nonexistent image frame', () => {
    const h = fixture()
    h.evaluate(`var node={id:'shot:one',kind:'shot',title:'Shot',nativeRevision:2,adoptedCandidateId:'accepted',frame:901,
      candidates:[{id:'accepted',frame:901,nativeMedia:{kind:'video',url:'/accepted.mp4'}},
        {id:'latest',frame:902,nativeMedia:{kind:'video',url:'/unreviewed.mp4'}}]};`)
    expect(h.value('studioNodePreview(node)')).toMatchObject({ kind: 'video', url: '/accepted.mp4', candidateId: 'accepted', state: 'adopted' })
    const html = h.evaluate('studioNodePreviewHtml(node)')
    expect(html).toContain('<video')
    expect(html).toContain('/accepted.mp4#t=0.001')
    expect(html).toContain('muted playsinline preload="metadata"')
    expect(html).not.toContain('/unreviewed.mp4')
    expect(html).not.toContain('still frame901')
  })

  it('uses real image URLs and an available image poster for a video', () => {
    const h = fixture()
    h.evaluate(`var node={id:'asset:girl',kind:'character',nativeRevision:1,adoptedCandidateId:'image',frame:17,
      candidates:[{id:'image',frame:17,nativeMedia:{kind:'image',url:'/girl.png'}}]};`)
    expect(h.evaluate('studioNodePreviewHtml(node)')).toContain('<img class="studio-node-preview-media" src="/girl.png"')
    h.evaluate("node.kind='shot';node.adoptedCandidateId='video';node.candidates.push({id:'video',frame:18,nativeMedia:{kind:'video',url:'/shot.mp4'}})")
    expect(h.evaluate('studioNodePreviewHtml(node)')).toContain('poster="/girl.png"')
  })

  it('shows saved script content and escapes markup', () => {
    const h = fixture()
    h.evaluate("var node={id:'story',kind:'story',text:'A paper boat <returns> home.',prompt:'Other draft'}")
    expect(h.value('studioNodePreview(node)')).toEqual({ kind: 'text', state: 'text', text: 'A paper boat <returns> home.' })
    const html = h.evaluate('studioNodePreviewHtml(node)')
    expect(html).toContain('studio-node-excerpt')
    expect(html).toContain('A paper boat &lt;returns> home.')
    expect(html).not.toContain('Other draft')
  })

  it('keeps ungenerated assets distinct from failed and active jobs', () => {
    const h = fixture()
    h.evaluate("var node={id:'asset:boat',kind:'image',nativeRevision:3,referenceOnly:true,candidates:[]}")
    expect(h.value('studioNodePreview(node)')).toEqual({ kind: 'empty', state: 'empty' })
    expect(h.evaluate('studioNodePreviewHtml(node)')).toContain('尚未生成')
    h.evaluate("studioNativeConfig.production.jobs=[{targetId:'boat',targetVersion:2,state:'failed'}]")
    expect(h.value('studioNodePreview(node)')).toEqual({ kind: 'empty', state: 'empty' })
    h.evaluate('studioNativeConfig.production.jobs[0].targetVersion=3')
    expect(h.evaluate('studioNodePreviewHtml(node)')).toContain('生成失败')
    h.evaluate("studioNativeConfig.production.jobs[0].state='unknown'")
    expect(h.evaluate('studioNodePreviewHtml(node)')).toContain('等待核对')
    h.evaluate("studioNativePendingRequests.set('asset:boat','pending')")
    expect(h.evaluate('studioNodePreviewHtml(node)')).toContain('studio-node-preview-spinner')
  })

  it('renders an unadopted candidate without adopting or changing saved inputs', () => {
    const h = fixture()
    h.evaluate(`var node={id:'shot:one',kind:'shot',title:'Shot',nativeRevision:2,adoptedCandidateId:null,referenceOnly:true,
      candidates:[{id:'candidate',nativeMedia:{kind:'video',url:'/candidate.mp4'}}]};var before=JSON.stringify(node);`)
    expect(h.value('studioNodePreview(node)')).toMatchObject({ state: 'candidate', candidateId: 'candidate' })
    expect(h.evaluate('studioNodePreviewHtml(node)')).toContain('待审阅')
    expect(h.evaluate('JSON.stringify(node)===before')).toBe(true)
  })

  it('uses the exact same preview in navigation and resource cards', () => {
    const h = fixture()
    h.evaluate(`var node={id:'shot:one',kind:'shot',title:'Shot',nativeRevision:1,adoptedCandidateId:'v',
      candidates:[{id:'v',nativeMedia:{kind:'video',url:'/same.mp4'}}]};S.nodes=[node];var before=JSON.stringify(S);`)
    const html = h.evaluate('studioNodePreviewHtml(node)')
    expect(h.evaluate('canvasNavigatorListHtml()')).toContain(html)
    expect(h.evaluate('referenceResourceCard(node)')).toContain(html)
    expect(h.evaluate('JSON.stringify(S)===before')).toBe(true)
  })

  it('shows a readable failure fallback without changing the node', () => {
    const h = fixture()
    const label = { textContent: '' }, container = { dataset: { previewState: 'adopted' }, querySelector: () => label }
    const target = { hidden: false, matches: () => true, closest: () => container }
    h.handlers.get('error')?.({ target })
    expect(target.hidden).toBe(true)
    expect(container.dataset.previewState).toBe('unavailable')
    expect(label.textContent).toBe('预览加载失败')
  })
})
