/** Frame edits preserve old media identities and apply confirmed transcript intervals once. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../studio/native-multitrack.js', import.meta.url), 'utf8')
const model = readFileSync(new URL('../studio/reference-cut-model.js', import.meta.url), 'utf8')
const gestures = readFileSync(new URL('../studio/reference-cut-gesture-model.js', import.meta.url), 'utf8')
function fixture() {
  let next = 0
  const context = {
    studioRandomUUID: () => `id-${++next}`, structuredClone,
    studioNativeConfig: { editCopy: { videoTrack: 'Video', audioTrack: 'Audio', subtitleTrack: 'Subtitles',
      unsupportedSource: 'Missing source', invalidEdit: 'Invalid edit', emptySubtitle: 'Empty subtitle', plainSubtitle: 'Plain text only' } },
  }
  const evaluate = (code: string): unknown => runInNewContext(code, context)
  evaluate(gestures + '\n' + model)
  evaluate(`var S={nodes:[]}; var studioCutApplyOriginal=referenceCutApply;
    function referenceCutStop(){}
    function studioCutClipMedia(clip){return clip?.source?.snapshot?.nativeMedia;}
    var production={fps:24,jobs:[{outputs:[{id:'m1',kind:'video',url:'/video.mp4'},{id:'m2',kind:'voice',url:'/voice.wav'}]}],timeline:[{videoId:'m1',voiceId:'m2',startFrame:24,frames:48,subtitle:'One'}]};
    studioNativeConfig.production=production;
    var oldSource=referenceCutSourceClip;referenceCutSourceClip=function(node,output,id){return {...oldSource(node,output,id),scale:100,sourceDuration:10};};
  `)
  evaluate(source.slice(0, source.indexOf('referenceOpenCut=')))
  evaluate(source.slice(source.indexOf('referenceCutApply=function'), source.indexOf('function studioEditCommitTracks')))
  evaluate(source.slice(source.indexOf('const studioEditContent='), source.indexOf('const studioEditSourceClip=')))
  evaluate(source.slice(source.indexOf('function studioEditTranscriptClips'), source.indexOf('function studioEditApplyTranscript')))
  const value = (code: string): unknown => JSON.parse(String(evaluate(`JSON.stringify(${code})`)))
  return { evaluate, value }
}

describe('native multitrack compatibility', () => {
  it('converts legacy voice replacement and subtitle without changing the old timeline', () => {
    const h = fixture()
    h.evaluate('var before=JSON.stringify(production.timeline);var editor={...referenceCutEmpty(),...studioEditFromProduction(production)}')
    expect(h.value('editor.nativeTracks.map(row=>row.kind)')).toEqual(['video', 'audio', 'subtitle'])
    expect(h.value('editor.clips.map(row=>[row.kind,row.start,row.sourceIn,row.duration,row.volume])'))
      .toEqual([['video', 0, 1, 2, 0], ['audio', 0, 0, 2, 100], ['text', 0, 0, 2, 100]])
    expect(h.value('JSON.stringify(production.timeline)===before')).toBe(true)
    expect(h.value('studioEditSerialize(editor,production).tracks[0].clips[0].sourceStartFrame')).toBe(24)
  })

  it('retains trimmed legacy UI voice replacement and subtitle while adding tracks', () => {
    const h = fixture()
    h.evaluate(`var legacy={clips:[{id:'old',kind:'video',track:'media',sourceIn:1.5,start:2,duration:1.5,
      volume:100,nativeVoiceId:'m2',nativeSubtitle:'Kept',source:{snapshot:{nativeMedia:{id:'m1'}}}}]};
      studioEditUpgradeLegacy(legacy)`)
    expect(h.value('legacy.clips.map(clip=>[clip.kind,clip.start,clip.sourceIn,clip.duration,clip.volume])'))
      .toEqual([['video', 2, 1.5, 1.5, 0], ['audio', 2, 0, 1.5, 100], ['text', 2, 0, 1.5, 100]])
    expect(h.value('legacy.clips[2].text')).toBe('Kept')
  })

  it('upgrades an existing node editor without replacing its clips or undo history', () => {
    const h = fixture()
    h.evaluate(`var node={id:'cut',kind:'quick-cut',editor:{...referenceCutEmpty(),selected:'old',playhead:1,
      clips:[{id:'old',kind:'video',track:'media',start:0,sourceIn:2,duration:3,sourceDuration:10,
        volume:80,source:{snapshot:{nativeMedia:{id:'m1',url:'/retained.mp4'}}}}]}};
      node.editor.undo=[{...referenceCutContent(node.editor),clips:[{...node.editor.clips[0],duration:2}]}];
      node.editor.redo=[{...referenceCutContent(node.editor),clips:[{...node.editor.clips[0],duration:4}]}];
      S.nodes=[node];function nodeById(id){return S.nodes.find(item=>item.id===id);}
      var opened;function studioCutOpenOriginal(id){opened=id;}
      studioNativeConfig.project={id:'project'};`)
    h.evaluate(source.slice(source.indexOf('referenceOpenCut='), source.indexOf('const studioEditTrackDefinitions=')))
    h.evaluate('referenceOpenCut("cut");var migrated=JSON.stringify(node.editor);studioEditEnsure(node)')
    expect(h.value('opened')).toBe('cut')
    expect(h.value('node.editor.selected')).toBe('old')
    expect(h.value('node.editor.clips[0]')).toMatchObject({ id: 'old', sourceIn: 2, duration: 3, volume: 80,
      source: { snapshot: { nativeMedia: { id: 'm1', url: '/retained.mp4' } } } })
    expect(h.value('node.editor.undo.length')).toBe(1)
    expect(h.value('node.editor.redo.length')).toBe(1)
    expect(h.value('node.editor.undo[0].nativeTracks')).toEqual(h.value('node.editor.nativeTracks'))
    expect(h.value('JSON.stringify(node.editor)===migrated')).toBe(true)
    h.evaluate('var undone=referenceCutReplay(node)')
    expect(h.value('undone.ok')).toBe(true)
    expect(h.value('node.editor.clips[0]')).toMatchObject({ id: 'old', sourceIn: 2, duration: 2 })
    expect(h.value('node.editor.clips[0].track')).toBe(h.value('node.editor.nativeTracks[0].id'))
    h.evaluate('var redone=referenceCutReplay(node,true)')
    expect(h.value('redone.ok')).toBe(true)
    expect(h.value('node.editor.clips[0]')).toMatchObject({ id: 'old', duration: 3 })
  })

  it('upgrades retained draft tracks before switching into the legacy editor', () => {
    const h = fixture()
    h.evaluate(`S.referenceProjectEdit={editor:{...referenceCutEmpty(),...studioEditFromProduction(production)}};
      var legacy={title:'Saved draft',editor:{...referenceCutEmpty(),selected:'old',
        clips:[{id:'old',kind:'video',track:'media',start:2,sourceIn:1,duration:2,
          source:{snapshot:{nativeMedia:{id:'m1',url:'/video.mp4'}}}}]}};
      S.referenceLegacyProjectEdit=legacy;var switched;
      function referenceCutRun(action){if(action==='native-legacy'){
        switched=JSON.stringify(S.referenceLegacyProjectEdit.editor.nativeTracks);
        var previous=S.referenceProjectEdit;S.referenceProjectEdit=S.referenceLegacyProjectEdit;
        S.referenceLegacyProjectEdit=previous;S.referenceProjectEdit.editor.nativeLegacy=true;
      }}`)
    h.evaluate(source.slice(source.indexOf('const studioEditRun='), source.indexOf('studioCutSubmit=function')))
    h.evaluate('referenceCutRun("native-legacy",S.referenceProjectEdit)')
    expect(h.value('JSON.parse(switched).map(track=>track.kind)')).toEqual(['video'])
    expect(h.value('S.referenceProjectEdit.title')).toBe('Saved draft')
    expect(h.value('S.referenceProjectEdit.editor.selected')).toBe('old')
    expect(h.value('S.referenceProjectEdit.editor.clips[0]')).toMatchObject({ id: 'old', start: 2, sourceIn: 1, duration: 2 })
    expect(h.value('S.referenceLegacyProjectEdit.editor.clips.length')).toBe(3)
  })

  it('upgrades old undo snapshots even when the current editor already has native tracks', () => {
    const h = fixture()
    h.evaluate(`var editor={...referenceCutEmpty(),...studioEditFromProduction(production)};
      var current=JSON.stringify(editor.clips);editor.undo=[{clips:[{id:'older',kind:'text',track:'text',
        start:0,duration:1,text:'Earlier'}],ratio:'16:9',export:{}}];
      studioEditUpgradeLegacy(editor)`)
    expect(h.value('JSON.stringify(editor.clips)===current')).toBe(true)
    expect(h.value('editor.undo[0].clips[0]')).toMatchObject({ id: 'older', text: 'Earlier' })
    expect(h.value('editor.undo[0].nativeTracks[0].kind')).toBe('subtitle')
    expect(h.value('editor.undo[0].clips[0].track')).toBe(h.value('editor.undo[0].nativeTracks[0].id'))
  })

  it('edits the migrated legacy tracks without requiring a native project marker', () => {
    const h = fixture()
    h.evaluate(`var owner={editor:{...referenceCutEmpty(),selected:'old',clips:[{id:'old',kind:'video',track:'media',
      start:0,sourceIn:1,duration:2,sourceDuration:10,source:{snapshot:{nativeMedia:{id:'m1'}}}}]}};
      studioEditEnsure(owner);var result=referenceCutApply(owner,{type:'gesture',id:'old',
        spec:{mode:'move',track:owner.editor.nativeTracks[0].id,start:4,snap:false}})`)
    expect(h.value('result.ok')).toBe(true)
    expect(h.value('owner.editor.clips[0]')).toMatchObject({ id: 'old', start: 4, sourceIn: 1 })
    expect(h.value('owner.editor.undo.length')).toBe(1)
    expect(h.value('owner.editor.selected')).toBe('old')
  })

  it('leaves the original draft intact when a legacy voice cannot be resolved', () => {
    const h = fixture()
    h.evaluate(`var editor={...referenceCutEmpty(),selected:'old',clips:[{id:'old',kind:'video',track:'media',
      start:0,duration:2,sourceIn:0,nativeVoiceId:'missing'}]};var before=JSON.stringify(editor)`)
    expect(() => h.evaluate('studioEditUpgradeLegacy(editor)')).toThrow('Missing source')
    expect(h.value('JSON.stringify(editor)===before')).toBe(true)
  })

  it('retains image drafts in visual tracks without changing their source snapshot', () => {
    const h = fixture()
    h.evaluate(`var editor={...referenceCutEmpty(),selected:'image',clips:[{id:'image',kind:'image',track:'media',
      start:0,duration:2,frame:7,source:{snapshot:{id:'candidate',frame:7}}}]};
      studioEditUpgradeLegacy(editor);var layer={elements:[],querySelectorAll(){return this.elements;},append(element){this.elements.push(element);}};
      var surface={querySelector(){return layer;}};
      var document={createElement(){return {dataset:{},style:{},remove(){layer.elements=layer.elements.filter(item=>item!==this);}};}};`)
    h.evaluate(source.slice(source.indexOf('function studioEditVisible'), source.indexOf('function studioEditVideoHtml')))
    h.evaluate(source.slice(source.indexOf('function studioEditUpdateStills'), source.indexOf('function studioEditUpdatePlayback')))
    h.evaluate('studioEditUpdateStills(surface,editor,0);var first=layer.elements[0];studioEditUpdateStills(surface,editor,1)')
    expect(h.value('editor.nativeTracks[0].kind')).toBe('video')
    expect(h.value('editor.clips[0]')).toMatchObject({ id: 'image', kind: 'image', frame: 7,
      source: { snapshot: { id: 'candidate', frame: 7 } } })
    expect(h.value('layer.elements.length')).toBe(1)
    expect(h.value('layer.elements[0]===first')).toBe(true)
    expect(h.value('layer.elements[0].className')).toContain('frame7')
    h.evaluate('studioEditUpdateStills(surface,editor,2,false)')
    expect(h.value('layer.elements.length')).toBe(1)
    h.evaluate('studioEditUpdateStills(surface,editor,2,true)')
    expect(h.value('layer.elements.length')).toBe(0)
  })

  it('round trips nested layers with stable clip ids, gains and transform', () => {
    const h = fixture()
    h.evaluate(`production.edit={version:1,tracks:[{id:'v1',kind:'video',name:'Main',muted:false,
      clips:[{id:'clip1',mediaId:'m1',startFrame:48,sourceStartFrame:24,frames:72,volume:0.5,opacity:0.7,
        transform:{x:0.2,y:0.1,width:0.5,height:0.5}}]},{id:'a1',kind:'audio',name:'Music',muted:true,
      clips:[{id:'audio1',mediaId:'m2',startFrame:0,sourceStartFrame:0,frames:72,volume:0.8}]},
      {id:'t1',kind:'subtitle',name:'Captions',muted:false,clips:[{id:'sub1',startFrame:24,frames:12,text:'Hello'}]}]};
      var editor={...referenceCutEmpty(),...studioEditFromProduction(production)};`)
    expect(h.value('studioEditSerialize(editor,production)')).toEqual(h.value('production.edit'))
  })

  it('accepts placement on a declared empty track and retains source trim', () => {
    const h = fixture()
    h.evaluate(`var editor={...referenceCutEmpty(),...studioEditFromProduction(production),fps:24,nativeProject:'project'};
      editor.nativeTracks.push({id:'second',kind:'video',name:'Overlay',muted:false});var owner={editor};var clip=editor.clips[0];
      var result=referenceCutApply(owner,{type:'gesture',id:clip.id,spec:{mode:'move',track:'second',start:1,snap:false}});`)
    expect(h.value('result.ok')).toBe(true)
    expect(h.value('owner.editor.clips[0].track')).toBe('second')
    expect(h.value('owner.editor.clips[0].sourceIn')).toBe(1)
    expect(h.value('owner.editor.nativeDirty')).toBe(true)
  })

  it('rejects unsupported transform rather than exporting altered content', () => {
    const h = fixture()
    h.evaluate('var editor={...referenceCutEmpty(),...studioEditFromProduction(production)};editor.clips[0].rotation=10')
    expect(() => h.evaluate('studioEditSerialize(editor,production)')).toThrow('Invalid edit')
  })

  it('replaces a confirmed transcript application instead of duplicating subtitle clips', () => {
    const h = fixture()
    h.evaluate(source.slice(source.indexOf('function studioEditApplyTranscript'), source.indexOf('const studioEditPaint=')))
    h.evaluate(`var owner={editor:{...referenceCutEmpty(),...studioEditFromProduction(production)}};
      var sourceId=owner.editor.clips[0].id;
      function referenceCutOwner(){return owner;}function save(){};
      function studioEditCommitTracks(current,change){change(current.editor.nativeTracks,current.editor.clips);}
      studioEditApplyTranscript(sourceId,'analysis1',[{startSeconds:1,endSeconds:2,text:'First'}]);
      production.edit=studioEditSerialize(owner.editor,production);owner.editor={...referenceCutEmpty(),...studioEditFromProduction(production)};
      studioEditApplyTranscript(sourceId,'analysis1',[{startSeconds:1,endSeconds:2,text:'Corrected'}]);`)
    expect(h.value('owner.editor.nativeTracks.length')).toBe(4)
    expect(h.value("owner.editor.clips.filter(row=>row.kind==='text'&&row.text!=='One').map(row=>[row.text,row.start,row.duration])"))
      .toEqual([['Corrected', 0, 1]])
  })

  it('refreshes the committed revision after export failure without replacing newer local edits', () => {
    const h = fixture()
    h.evaluate(`var owner={editor:{...referenceCutEmpty(),...studioEditFromProduction(production),nativeRevision:1}};
      function referenceCutOwner(){return owner;}function save(){}function referenceCutPaint(){};
      var parent={},messages=[];var window={addEventListener(type,callback){messages.push(callback);}};
      var server={...production,revision:8,edit:studioEditSerialize(owner.editor,production)};
      owner.editor.clips[0].volume=45;var before=JSON.stringify(owner.editor.clips);`)
    h.evaluate(source.slice(source.indexOf('function studioEditApplySavedProduction'), source.indexOf("document.addEventListener('click'")))
    h.evaluate("messages[0]({source:parent,data:{channel:'crewon-studio-v1',type:'cut-failed',production:server}})")
    expect(h.value('owner.editor.nativeRevision')).toBe(8)
    expect(h.value('owner.editor.nativeDirty')).toBe(true)
    expect(h.value('JSON.stringify(owner.editor.clips)===before')).toBe(true)
    h.evaluate('var studioCutRequest=null;function referenceCutStop(){};var sent;function studioNativePost(type,value){sent={type,...value};}function toast(){};')
    h.evaluate(source.slice(source.indexOf('studioCutSubmit=function'), source.indexOf('function studioEditApplySavedProduction')))
    h.evaluate('studioCutSubmit(owner,false)')
    expect(h.value('sent.revision')).toBe(8)
    expect(h.value('sent.edit.tracks[0].clips[0].volume')).toBe(0.45)
  })

  it('keeps muted video visible while hiding a muted subtitle track', () => {
    const h = fixture()
    h.evaluate(source.slice(source.indexOf('function studioEditVisible'), source.indexOf('function studioEditVideoHtml')))
    expect(h.value("studioEditVisible({nativeTracks:[{id:'v',kind:'video',muted:true},{id:'s',kind:'subtitle',muted:true}],clips:[{id:'video',kind:'video',track:'v',start:0,duration:2},{id:'caption',kind:'text',track:'s',start:0,duration:2}]},1).map(row=>row.id)"))
      .toEqual(['video'])
  })

  it('keeps captions in a separate layer above retained media', () => {
    const h = fixture()
    h.evaluate(`function esc(value){return value;}var owner={editor:{...referenceCutEmpty(),playhead:0,
      nativeTracks:[{id:'s',kind:'subtitle',muted:false},{id:'v',kind:'video',muted:false}],
      clips:[{id:'caption',kind:'text',text:'Visible caption',track:'s',start:0,duration:2},
        {id:'video',kind:'video',track:'v',start:0,duration:2,opacity:100,source:{snapshot:{nativeMedia:{id:'m1',url:'/video.mp4'}}}}]}};`)
    h.evaluate(source.slice(source.indexOf('function studioEditVisible'), source.indexOf('referenceCutUpdatePreview=function')))
    h.evaluate('var html=referenceCutPreviewHtml(owner)')
    expect(h.value('html.indexOf("native-edit-media")<html.indexOf("native-edit-captions")')).toBe(true)
    const css = readFileSync(new URL('../studio/native-multitrack.css', import.meta.url), 'utf8')
    expect(css).toContain('.native-edit-captions{position:absolute;z-index:1;')
  })

  it('rejects caption style markup before it reaches the subtitle renderer', () => {
    const h = fixture()
    expect(() => h.evaluate("studioEditTranscriptClips({sourceIn:0,start:0,duration:2},[{startSeconds:0,endSeconds:1,text:'<b>Styled</b>'}],'sub',24)"))
      .toThrow('Plain text only')
    expect(() => h.evaluate("studioEditTranscriptClips({sourceIn:0,start:0,duration:2},[{startSeconds:0,endSeconds:1,text:'{\\\\pos(1,2)}Styled'}],'sub',24)"))
      .toThrow('Plain text only')
  })

  it('intersects source transcript with a trimmed clip and maps it onto project frames', () => {
    const h = fixture()
    h.evaluate(`var mapped=studioEditTranscriptClips({sourceIn:2,start:10,duration:3},
      [{startSeconds:0,endSeconds:1,text:'Outside'},{startSeconds:1,endSeconds:3,text:' First '},
        {startSeconds:4,endSeconds:7,text:'Last'}],'captions',24)`)
    expect(h.value('mapped.map(row=>[row.text,row.start,row.duration])')).toEqual([['First', 10, 1], ['Last', 12, 1]])
    expect(h.value("studioEditTranscriptClips({sourceIn:2,start:0,duration:1},[{startSeconds:2,endSeconds:3,text:'   '}],'captions',24).length")).toBe(0)
  })
})
