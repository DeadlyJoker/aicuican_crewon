/* Entry drafts keep an imported screenplay separate from creative instructions. */
'use strict';
const referenceScriptLimit=150000;
/** Validate an imported text without changing the committed entry draft. */
function referenceValidateScript(text){
 const normalized=String(text).replace(/^\uFEFF/,'').trim();
 if(!normalized)return {ok:false,error:'请先粘贴剧本内容'};
 if(normalized.length>referenceScriptLimit)return {ok:false,error:'剧本最多支持 150,000 字，请缩短后重试'};
 return {ok:true,text:normalized};
}
/** Resolve the selected entry's input; an unrelated creative prompt cannot enable screenplay production. */
function referenceEntryInput(state){
 if(state.referenceMode==='drama'&&state.referenceDrama==='produce')return state.referenceScriptInput?.text||'';
 if(state.referenceMode==='drama'&&state.referenceDrama==='redraw')return '';
 return state.referenceEntryDrafts?state.referenceEntryDrafts[state.referenceMode||'drama']||'':state.drafts.shared||'';
}

/** Preserve the current legacy draft before separating creation-mode inputs. */
function referenceSetEntryInput(state,text){
 const key=state.referenceMode||'drama';
 state.referenceEntryDrafts??={[key]:state.drafts.shared||''};
 state.referenceEntryDrafts[key]=text;state.drafts.shared=text;
}

/** Retire the homepage previs entry while retaining its independent input and all projects. */
function referenceResolveHomeMode(state){
 if(state.referenceMode!=='previs')return;
 referenceSetEntryInput(state,referenceEntryInput(state));state.referenceMode='drama';
 state.drafts.shared=referenceEntryInput(state);
}

/** Open an existing creation entry without submitting it or discarding another entry's input. */
function referenceSelectHomeFeature(state,feature){
 if(!['script','image','audio','video'].includes(feature))return false;
 referenceSetEntryInput(state,referenceEntryInput(state));
 state.referenceMode=feature==='script'?'drama':'create';
 if(feature==='script')state.referenceDrama='write';else state.referenceCreateKind=feature;
 state.drafts.shared=referenceEntryInput(state);return true;
}
