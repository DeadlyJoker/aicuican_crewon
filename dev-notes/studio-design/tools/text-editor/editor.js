/** The Demo stores Lexical JSON and plain text; rendered HTML is always sanitized. */
import {createEditor,$getRoot,$createParagraphNode,$createTextNode,$createLineBreakNode,$getSelection,$isRangeSelection,FORMAT_TEXT_COMMAND,UNDO_COMMAND,REDO_COMMAND} from 'lexical';
import {registerRichText,HeadingNode,QuoteNode,$createHeadingNode} from '@lexical/rich-text';
import {createEmptyHistoryState,registerHistory} from '@lexical/history';
import {TableNode,TableCellNode,TableRowNode,registerTablePlugin,registerTableSelectionObserver,INSERT_TABLE_COMMAND} from '@lexical/table';
import {$setBlocksType} from '@lexical/selection';
import {$generateHtmlFromNodes} from '@lexical/html';
import DOMPurify from 'dompurify';
const nodes=[HeadingNode,QuoteNode,TableNode,TableCellNode,TableRowNode];
const theme={paragraph:'ref-text-paragraph',heading:{h1:'ref-text-h1',h2:'ref-text-h2',h3:'ref-text-h3'},text:{bold:'ref-text-bold',italic:'ref-text-italic',underline:'ref-text-underline'},table:'ref-text-table',tableCell:'ref-text-cell',tableCellHeader:'ref-text-cell-header'};
function makeEditor(){return createEditor({namespace:'CrewON Studio text',nodes,theme,onError(error){throw error;}});}
function plain(editor,text){editor.update(()=>{const root=$getRoot();root.clear();for(const line of text.split('\n'))root.append($createParagraphNode().append($createTextNode(line)));},{discrete:true});}
function html(editor){return DOMPurify.sanitize($generateHtmlFromNodes(editor),{ALLOWED_TAGS:['p','br','span','b','strong','i','em','u','s','h1','h2','h3','blockquote','table','tbody','tr','td','th','colgroup','col'],ALLOWED_ATTR:['colspan','rowspan']});}
/** Render only known node types; callers retain invalid older records for recovery. */
export function preview(document){const editor=makeEditor();editor.setEditorState(editor.parseEditorState(document));return editor.getEditorState().read(()=>html(editor));}
/** Mount one editor, keeping editing undo separate from canvas undo. */
export function mount(element,{document,text,onChange,onSelection}){
 const editor=makeEditor();editor.setRootElement(element);
 const disposers=[registerRichText(editor),registerHistory(editor,createEmptyHistoryState(),300),registerTablePlugin(editor),registerTableSelectionObserver(editor,true)];
 if(document)editor.setEditorState(editor.parseEditorState(document));else plain(editor,text||'');
 disposers.push(editor.registerUpdateListener(({editorState,dirtyElements,dirtyLeaves})=>{
  editorState.read(()=>{const selection=$getSelection();let block=$isRangeSelection(selection)?selection.anchor.getNode():null;while(block&&!['heading','paragraph','root'].includes(block.getType()))block=block.getParent();const tag=block?.getType()==='heading'?block.getTag():'';onSelection?.({h1:tag==='h1',h2:tag==='h2',h3:tag==='h3',paragraph:!tag,bold:$isRangeSelection(selection)&&selection.hasFormat('bold'),italic:$isRangeSelection(selection)&&selection.hasFormat('italic'),underline:$isRangeSelection(selection)&&selection.hasFormat('underline')});if(dirtyElements.size||dirtyLeaves.size)onChange({document:editorState.toJSON(),text:$getRoot().getTextContent()});});
 }));
 return {
  focus(){editor.focus();},
  command(name){
   if(['bold','italic','underline'].includes(name))editor.dispatchCommand(FORMAT_TEXT_COMMAND,name);
   else if(name==='undo'||name==='redo')editor.dispatchCommand(name==='undo'?UNDO_COMMAND:REDO_COMMAND,undefined);
   else if(/^h[123]$/.test(name))editor.update(()=>{const selection=$getSelection();if($isRangeSelection(selection))$setBlocksType(selection,()=>$createHeadingNode(name));});
   else if(name==='paragraph')editor.update(()=>{const selection=$getSelection();if($isRangeSelection(selection))$setBlocksType(selection,$createParagraphNode);});
   else if(name==='table')editor.dispatchCommand(INSERT_TABLE_COMMAND,{rows:'2',columns:'2',includeHeaders:true});
  },
  snapshot(){return editor.getEditorState().read(()=>({document:editor.getEditorState().toJSON(),text:$getRoot().getTextContent()}));},
  destroy(){for(const dispose of disposers.reverse())dispose();editor.setRootElement(null);}
 };
}

/** Convert plain document content to the same durable rich-text record used by editing. */
export function fromText(text){const editor=makeEditor();editor.update(()=>{const root=$getRoot();root.clear();for(const block of text.split('\n\n')){const paragraph=$createParagraphNode();block.split('\n').forEach((line,index)=>{if(index)paragraph.append($createLineBreakNode());if(line)paragraph.append($createTextNode(line));});root.append(paragraph);}},{discrete:true});return editor.getEditorState().read(()=>({document:editor.getEditorState().toJSON(),text:$getRoot().getTextContent()}));}
