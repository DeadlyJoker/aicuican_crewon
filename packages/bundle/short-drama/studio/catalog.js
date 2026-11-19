/* Product-design fixtures only. No media API requests or real pricing. */
const studioGoals = {
  image: { label: '图片', icon: 'image', title: '把一个想法，变成一张好画面。', hint: '描述你想要的图片，也可以先上传参考图', placeholder: '为一篇关于城市夜归人的文章，设计一张有温度的封面。雨夜，车站，一点暖光。', examples: ['雨夜城市封面', '角色三视图', '为照片换一种光'], button: '准备图片方案', kind: '图片创作' },
  video: { label: '视频', icon: 'film', title: '让画面动起来，让想法有声音。', hint: '从想法、图片或已有视频开始', placeholder: '把雨夜的站台拍成一段 8 秒的视频，镜头慢慢推进，灯光温暖。', examples: ['一张图变成短视频', '首尾帧过渡', '延续一段视频'], button: '准备视频方案', kind: '视频创作' },
  audio: { label: '声音', icon: 'mic', title: '为你的作品，找到合适的声音。', hint: '旁白、配音与音乐，都从你的表达开始', placeholder: '为夜归人的短片写一段 20 秒旁白，温暖、自然，不要刻意煽情。', examples: ['温暖自然的旁白', '雨夜氛围音乐', '从视频中提取音轨'], button: '准备声音方案', kind: '声音创作' },
  drama: { label: '短剧', icon: 'file', title: '把一个故事，做成完整作品。', hint: '从想法、剧本、小说或参考视频开始', placeholder: '一个雨夜，末班车开走后，守站人把一盏旧灯借给迷路的旅人……', examples: ['雨夜里的一盏灯', '从已有剧本开始', '把小说改成轻漫剧'], button: '准备制作方案', kind: '短剧制作' },
  blank: { label: '自由画布', icon: 'grid', title: '一张画布，放下所有创作想法。', hint: '先放入素材，再决定下一步', placeholder: '想先整理什么？参考图片、文案、视频、声音，都可以放在一起。', examples: ['整理参考素材', '比较多种创作方向', '自由组合图片与声音'], button: '打开自由画布', kind: '自由创作' }
};
const studioExamples = [
  { key: 'asset-study', name: 'rhTV · 资产卡片对照', description: '原站素材 · 本机样式参考', frame: 901, action: '对照卡片' },
  { key: 'drama-series', name: '末班灯 · 全剧示例', description: '五集剧本 · 全剧资产 · 示例', frame: 0, action: '查看剧本' },
  { key: 'drama', name: '末班灯', description: '剧情短片 · 方案待确认', frame: 0, action: '继续制作' },
  { key: 'previs', name: '雨夜站台 · 镜头预演', description: '镜头预演 · 场景与机位', frame: 4, action: '查看机位' },
  { key: 'interactive', name: '最后一班车 · 互动故事', description: '互动故事 · 两条选择路径', frame: 5, action: '查看结构' }
];
const studioTools = {
  image: [
    { name: '构图与视角', items: ['参考图编辑', '多机位九宫格', '剧情推演四宫格', '25 宫格分镜', '多角度相机', '图层拆分'] },
    { name: '修图与增强', items: ['局部重绘', '抠图', '扩图', '擦除文字', '画质增强', '图片超分'] },
    { name: '角色与表情', items: ['角色三视图', '微笑', '思考', '生气', '疑惑', '哭泣'] },
    { name: '光影与环境', items: ['主光', '逆光与轮廓光', '伦勃朗布光', '高调光', '雨天', '深度视差'] },
    { name: '更多专业能力', items: ['图转 3D', '图转空间', '画板与标注'] }
  ],
  video: [
    { name: '视频创作', items: ['图片生成视频', '首尾帧过渡', '多模态参考', '视频续写', '片段重拍', '视频编辑'] },
    { name: '精修与后期', items: ['视频超分', '画质增强', '扩展画幅', '动作迁移', '深度视频', '提取音轨'] }
  ],
  audio: [
    { name: '声音创作', items: ['文字配音', '旁白改写', '氛围音乐', '音乐续写'] },
    { name: '声音处理', items: ['音轨提取', '声音克隆', '对白与音乐混合'] }
  ],
  text: [{ name: '文字与剧本', items: ['改写与润色', '创作提纲', '拆成分镜', '提取角色与场景'] }]
};
function mediaKind(node) {
  if (!node) return 'image';
  if (['shot', 'video', 'final', 'camera'].includes(node.kind)) return 'video';
  if (['voice', 'audio'].includes(node.kind)) return 'audio';
  if (['story', 'note', 'text', 'choice'].includes(node.kind)) return 'text';
  return 'image';
}
function makeStudioExample(key, brief) {
  if(key==='asset-study')return makeStudioAssetStudy();
  if(key==='drama-series')return makeStudioSeriesExample();
  if(['previs','interactive'].includes(key))return makeStoryWorkspace(key,brief);
  if (key === 'drama') return makeStudioDramaExample();
  const common = { status: '草稿', frame: 0, seconds: 8, dialogue: '', prompt: '', w: 284, h: 286 };
  const node = (id, kind, label, title, x, y, extra = {}) => ({ ...common, id, kind, label, title, x, y, ...extra });
  const story = node('brief', 'text', '创作目标', key === 'audio' ? '给夜归人的一段话' : '让夜色里有一点温度', 96, 100, { h: 240, text: brief || (key === 'audio' ? '为城市夜归人的短片准备一段自然、温暖的旁白。约 20 秒，保留安静的停顿。' : '青蓝色雨夜，一盏暖灯。画面留出标题区域，克制、安静、有故事感。'), description: '先确认表达，再处理画面。' });
  if (key === 'blank') return { project: '自由创作画布', projectKind: 'blank', nodes: [node('blank-note', 'note', '灵感便签', '从这里开始', 170, 130, { h: 210, text: brief || '放入文字、图片、视频或声音，再把有关的内容连起来。', description: '点击左侧 +，添加第一份素材' })], edges: [], clips: [] };
  if (key === 'audio-music') return { project: '音乐创作', projectKind: 'audio', nodes: [node('brief','text','创作目标','音乐创作方向',96,100,{h:240,text:brief||'',description:'先确认音乐风格，再填写歌词。'}),node('audio-result','voice','音乐','待创作的音乐',440,100,{h:235,referenceOnly:true,candidates:[],adoptedCandidateId:null,description:'音乐风格与歌词分别编辑，尚未生成',prompt:'',dialogue:''})],edges:[['brief','audio-result']],clips:[] };
  if (key === 'audio') return { project: '城市夜归旁白', projectKind: 'audio', nodes: [story, node('audio-script', 'text', '声音稿', '灯亮的地方', 440, 100, { text: '有时候，回家的路只差一盏灯。愿每个赶路的人，都能在夜色里，找到属于自己的温暖。', h: 270 }), node('audio-result', 'voice', '声音候选', '温暖自然的旁白', 810, 100, { seconds: 20, h: 235, dialogue: '有时候，回家的路只差一盏灯。', description: '普通话 · 自然叙述 · 20 秒', prompt: '温暖、自然，句尾留出停顿，不刻意煽情。' })], edges: [['brief','audio-script'],['audio-script','audio-result']], clips: ['audio-result'] };
  const reference = node('reference', 'image', '参考图片', '雨夜站台', 440, 100, { frame: 0, status: '已采用', description: '色调、光线与空间参考' });
  if (key === 'video') return { project: '灯亮的地方', projectKind: 'video', nodes: [story, reference, node('video-result', 'video', '视频候选', '灯亮的地方 · 8 秒', 805, 100, { frame: 0, description: '缓慢推进 · 保留雨夜环境声', prompt: '雨夜站台，镜头缓缓向暖灯推进，画面平稳。', dialogue: '总有一盏灯，等你回家。', status: '待确认' }), node('video-voice', 'voice', '声音', '雨夜环境与旁白', 805, 470, { h: 210, seconds: 8, description: '雨声轻铺，旁白自然', dialogue: '总有一盏灯，等你回家。' })], edges: [['brief','reference'],['reference','video-result'],['video-result','video-voice']], clips: ['video-result'] };
  return { project: '雨夜城市封面', projectKind: 'image', nodes: [story, reference, node('image-result', 'image', '图片候选', '夜归人的城市封面', 805, 100, { frame: 5, description: '电影感 · 横版封面 · 暖光留白', prompt: '雨夜站台，青蓝色环境与一点暖光形成对照。右侧留白，适合作为文章封面。', status: '待确认' }), node('image-note', 'note', '修改建议', '保留暖光，减少杂物', 805, 470, { h: 210, text: '保留站台的暖灯与雨水反光。让标题留白更干净，其他画面先不调整。' })], edges: [['brief','reference'],['reference','image-result'],['image-result','image-note']], clips: [] };
}

/* Work recipes are project structures, never top-level media categories. */
function makeStoryWorkspace(kind, brief){
  const base={status:'示例',frame:0,seconds:8,dialogue:'',prompt:'',w:284,h:285};
  const node=(id,type,label,title,x,y,extra={})=>({...base,id,kind:type,label,title,x,y,...extra});
  if(kind==='previs'&&brief?.trim())return {project:'空间预演',projectKind:'previs',nodes:[
    node('previs-intent','text','预演要求','场景与镜头要求',96,100,{h:300,text:brief,status:'已保存'}),
    node('previs-plan','note','空间规划','待规划空间与机位',470,100,{h:300,text:'预演要求已保存在左侧。下一步需要规划场景、人物动作与相机路径。当前 Demo 尚未接入三维预演服务，没有自动生成白模或镜头结果。',status:'待规划'})
  ],edges:[['previs-intent','previs-plan']],clips:[]};
  if(kind==='previs')return {project:'雨夜站台 · 镜头预演',projectKind:'previs',nodes:[
    node('previs-intent','text','镜头意图','站台上的擦肩',96,100,{h:240,text:brief||'两人在站台擦肩而过。镜头跟随旅人，最后停在那盏暖灯前。'}),
    node('previs-scene','image','场景参考','旧站台 · 雨夜',440,100,{status:'已采用',description:'保留空间关系、雨夜色调与灯光方向'}),
    node('previs-camera','camera','机位草图','机位 01 · 跟随旅人',805,100,{h:300,prompt:'从站台入口跟随旅人向前，经过守站人后转向暖灯。',description:'平面关系示意 · 尚未渲染',seconds:8}),
    node('previs-frame','image','构图参考','停在灯亮的地方',805,485,{frame:5,description:'先确认构图和路径，再决定是否制作视频'})
  ],edges:[['previs-intent','previs-scene'],['previs-scene','previs-camera'],['previs-camera','previs-frame']],clips:[]};
  if(kind==='interactive'&&brief?.trim())return {project:'互动影游',projectKind:'interactive',nodes:[
    node('interactive-intent','text','故事创意','故事与观众选择',96,100,{h:300,text:brief,status:'已保存'}),
    node('interactive-plan','note','故事结构','待编排分支与结局',470,100,{h:340,text:'故事创意和结构要求已保存。当前尚未生成分支、镜头或结局；可从首页示例进入预写故事，试走选择与结局。',status:'待编排'})
  ],edges:[['interactive-intent','interactive-plan']],clips:[]};
  return {project:'最后一班车 · 互动故事',projectKind:'interactive',nodes:[
    node('story-intent','text','故事目标','错过末班车之后',96,100,{h:250,text:brief||'一个雨夜，旅人错过末班车。留在站台，还是追随街口的灯光？让一次选择改变故事的结局。'}),
    node('story-opening','image','开场','末班车已经开走',440,100,{description:'雨还没停，站台另一端出现一点暖光。'}),
    node('story-choice','choice','选择点','你想往哪里走？',805,100,{h:265,text:'雨还没有停，你听见身后有人叫你。',options:[{label:'留在站台，寻找守站人',target:'ending-a'},{label:'跟随灯光，走向街口',target:'story-second-choice'}]}),
    node('story-second-choice','choice','选择点','街口之后，继续还是回望？',1180,495,{h:265,text:'街口的灯照亮了岔路。你看到远处熟悉的站台，也听见巷子里传来脚步声。',options:[{label:'回到站台，向守站人求助',target:'ending-a'},{label:'走进雨巷，寻找同行的人',target:'ending-b'}]}),
    node('ending-a','ending','结局 A','一盏借来的灯',1180,100,{frame:0,description:'旅人遇见守站人，带着借来的旧灯回家。'}),
    node('ending-b','ending','结局 B','街口的相遇',1535,495,{frame:5,description:'循着街口灯光，旅人遇见了同样赶路的人。'})
  ],edges:[['story-intent','story-opening'],['story-opening','story-choice'],['story-choice','ending-a'],['story-choice','story-second-choice'],['story-second-choice','ending-a'],['story-second-choice','ending-b']],clips:[]};
}
