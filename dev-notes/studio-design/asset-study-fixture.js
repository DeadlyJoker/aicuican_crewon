/* Private reference study: imported rhTV project images, never generated CrewON outputs. */
'use strict';
/** Build an independent card-comparison project without changing saved creative projects. */
function makeStudioAssetStudy(){
 const source='https://rhtv.runninghub.ai/project/canvas/2117506590155177986';
 const roles=[['lin','林彻',901],['lin-action','林彻-灾变行动服',null,'lin'],['su','苏晚',902],['su-coat','苏晚-灾变撤离服',null,'su'],['zhao','赵磊'],['zhao-action','赵磊-灾变匪首服',null,'zhao'],['father','林建国'],['father-work','林建国-仓库备灾工装',null,'father'],['zhou','老周'],['mother','苏母'],['mother-coat','苏母-灾变避难服',null,'mother'],['teacher','数学老师'],['shopkeeper','店老板']];
 const scenes=['高三教室','学校楼道走廊与楼梯口','林家住宅','网吧与二手市场街市','学校小卖部旁','城郊仓库安全点','苏晚家居民楼','灾变城市街巷与市场街道','废弃加油站','城西配送站及外围荒地'];
 const props=['退烧药-限购标签','备灾清单','苏晚应急药品与地址袋','明城逃生路线地图','防身短棍与破窗器','金属铭牌-陌生符号日期'];
 const asset=(id,title,kind,index,frame=null,parent=null)=>({id,kind,label:kind==='character'?'角色':kind==='scene'?'场景':'道具',title,description:'rhTV 项目卡片样式对照素材；仅本机参考，不代表 CrewON 生成结果。',x:450+(index%5)*412,y:100+Math.floor(index/5)*500,w:380,h:436,status:frame?'已采用':'待制作',referenceOnly:!frame,frame:frame||0,candidates:frame?[{id:id+'-reference',number:1,frame,importedFile:title+' · rhTV参考图',referenceStudySource:source}]:[],adoptedCandidateId:frame?id+'-reference':null,...(parent?{variantOf:'study-'+parent}:{}),...(kind==='image'?{assetCategory:'prop'}:{}),referenceStudySource:source});
 const nodes=roles.map(([id,title,frame,parent],i)=>asset('study-'+id,title,'character',i,frame,parent));
 nodes.push(...scenes.map((title,i)=>asset('study-scene-'+i,title,'scene',i+roles.length)),...props.map((title,i)=>asset('study-prop-'+i,title,'image',i+roles.length+scenes.length)));
 const ids=nodes.map(n=>n.id),text='本项目仅用于对照 rhTV 资产卡片的尺寸、布局与交互。两张角色图来自用户指定的已登录项目，其余图片保持空态。未运行生成，未复制原项目剧本；素材未获得独立商用授权，不纳入正式产品资源。';
 const story={id:'study-story',kind:'story',label:'参考说明',title:'rhTV 资产卡片样式对照',text,x:64,y:100,w:260,h:300,scriptDocument:{revision:1,title:'资产卡片样式对照',logline:text,legacyText:text,scenes:[]},scriptSeries:{version:1,title:'资产卡片样式对照',logline:text,setting:text,targetSeconds:{min:0,max:0},stage:'assets',sharedAssetIds:ids,episodes:[{id:'study-episode',number:1,primary:true,assetIds:ids,outline:{event:text,conflict:'',hook:''}}]}};
 return {project:'rhTV · 资产卡片对照',projectKind:'drama',nodes:[story,...nodes],edges:ids.map(id=>[story.id,id]),clips:[]};
}
