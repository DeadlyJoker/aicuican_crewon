/* Authored five-episode design fixture. It is separate from every saved single-episode project. */
'use strict';
/** Build a fresh example with the characters, places and prop named in its screenplay. */
function makeStudioDramaExample(){
 const nodes=structuredClone(initialNodes);
 nodes.push({id:'keeper',kind:'character',label:'角色',title:'陈叔 · 守站人',description:'寡言的老守站人，总在最后一班车离开后检查站台。帮助别人时从不把善意说得很大。',x:762,y:96,w:248,h:276,status:'待制作',referenceOnly:true,frame:3},{id:'crossroad',kind:'scene',label:'场景',title:'街口 · 黎明',description:'雨停后的街口，潮湿路面反着晨光，商铺陆续开门。',x:762,y:475,w:248,h:276,status:'待制作',referenceOnly:true,frame:5},{id:'lamp',kind:'image',assetCategory:'prop',label:'道具',title:'旧灯',description:'一盏能手提的旧灯，灯罩有细小划痕，暖光稳定。全剧沿用同一件道具。',x:414,y:854,w:248,h:276,status:'待制作',referenceOnly:true,frame:0});
 for(const node of nodes){
  if(node.kind==='shot')node.x+=354;
  if(node.kind==='final')node.x+=354;
 }
 const directions=[
  {color:'青蓝色雨夜，远处车尾灯保留一点暗红。',blocking:'@林晚 · 旅人 站在站台右侧檐下，面向远去的末班车，始终不跨出黄色安全线。',lighting:'@旧站台 · 雨夜 的顶灯形成柔和冷光，湿地反射微弱暖色，不照亮远处的黑暗。',performance:'疲惫、克制；目送车尾灯后轻轻垂下肩膀，不哭喊。',sound:'雨点落在铁皮棚顶，远去的车轮声逐渐减弱。'},
  {color:'保留青蓝环境色，以旧灯的暖黄色为画面中心。',blocking:'@陈叔 · 守站人 从画面左侧走近，将 @旧灯 递到 @林晚 · 旅人 面前；两人隔着半步距离完成交接。',lighting:'旧灯照亮双手与衣袖，人物面部保留柔和暗部，背景延续站台冷光。',performance:'陈叔平静自然，林晚先迟疑再接过灯，动作轻而慢。',sound:'近处雨声持续，手指接触灯柄时发出轻微碰响。'},
  {color:'雨巷以深蓝为底，灯的暖色在地面形成短而稳定的光带。',blocking:'@林晚 · 旅人 提着 @旧灯 走向 @街口 · 黎明，停半步回望，再继续前行。',lighting:'灯光从腰下照亮脚边，远处街口逐渐出现微弱天光。',performance:'回望时轻轻点头，随后步伐比先前稳定，保持含蓄。',sound:'鞋底踏过浅水，雨声渐弱，远处开始出现城市晨间声。'},
  {color:'淡蓝晨光逐渐取代深蓝夜色，店铺灯光保留少量暖色。',blocking:'固定远景中，@林晚 · 旅人 从 @街口 · 黎明 的画面中央走向远处，留出逐渐明亮的街道。',lighting:'天空是柔和散射光，路面反光不过曝，旧灯亮度逐渐融入环境。',performance:'自然前行，不回头或向镜头表演；用空间与天光收束情绪。',sound:'残留滴水声、远处卷帘门声；旁白结束后保留一拍环境声。'},
 ];
 const shots=nodes.filter(node=>node.kind==='shot').map((shot,index)=>({id:shot.id,title:shot.title,action:shot.prompt||shot.description||'',dialogue:shot.dialogue||'',seconds:shot.seconds||6,storyboardFields:{...directions[index],prompt:[shot.prompt||shot.description,directions[index].blocking,directions[index].lighting,directions[index].performance,directions[index].sound,shot.dialogue].filter(Boolean).join('\n')}}));
 nodes.find(node=>node.id==='story').scriptDocument={revision:1,title:'末班灯',logline:'错过末班车的旅人借到一盏旧灯，在雨夜找到回家的路。',scenes:[{id:'script-scene-1',title:'站台 · 夜',shots:shots.slice(0,2)},{id:'script-scene-2',title:'街口 · 黎明',shots:shots.slice(2)}]};
 const edges=[['story','actor'],['story','keeper'],['story','scene'],['story','crossroad'],['story','lamp'],['actor','shot1'],['actor','shot2'],['actor','shot3'],['keeper','shot2'],['scene','shot1'],['scene','shot2'],['crossroad','shot3'],['crossroad','shot4'],['lamp','shot2'],['lamp','shot3'],['shot1','final'],['shot2','final'],['shot3','final'],['shot4','final']];
 return {project:'末班灯',projectKind:'drama',nodes,edges,clips:['shot1','shot2','shot3','shot4']};
}
function makeStudioSeriesExample(){
 const recipe=makeStudioDramaExample(),nodes=recipe.nodes,story=nodes.find(n=>n.id==='story');
 const rows=[
  ['未送出的信','林晚发现旧灯底座里夹着一封未寄出的信，返回站台询问。陈叔没有讲自己的故事，只请她明天把灯借给需要的人。','林晚想立刻还清人情，陈叔却不愿把帮助变成一笔欠账。','离开前，林晚看见站台公告：今晚将临时停电。',45,[['站台 · 傍晚','发现灯座里的信','林晚整理挎包时摸到灯座夹层，纸角写着一个遥远的地名。她把信重新放好，转身走回站台。','有些东西，还是该亲手还。'],['站台 · 傍晚','不必急着归还','陈叔收起信，给旧灯换上充满电的电池。林晚伸手还灯，他把灯柄轻轻推回。','先留着。明天有人需要，你就借给他。']]],
  ['停电之后','站台忽然停电。林晚用旧灯照亮湿滑台阶，与陈叔一起引导乘客绕过积水。','赶路的人越来越多，一盏灯只能照亮很小的地方，林晚必须先把最危险的一段路看清。','一个年轻人接过灯，回头问她：你不需要回家吗？',50,[['旧站台 · 雨夜','灯没有灭','顶棚灯全部熄灭，人群短暂安静。林晚把旧灯放低，让台阶的边缘从黑暗里显出来。','别急，先看脚下。'],['旧站台 · 雨夜','让出那一点光','陈叔扶着行动不便的乘客下台阶，林晚把灯交给年轻人，请他照住最后两级。','我认得这条路了。你帮我照一下他们。']]],
  ['一盏灯的接力','林晚再次走过街口时，发现旧灯已经传到另一位陌生人手里。她和年轻人修好松动的提手，把灯带回站台。','林晚担心重要的东西在传递中丢失，又逐渐明白被保存下来的不只是一件物品。','站台值班室已经搬空，桌上只留下一张新的时刻表。',48,[['街口 · 夜','认出那盏灯','一位店主借灯给提着重物的陌生人。林晚认出灯罩上的划痕，没有急着上前。','原来你走得比我还远。'],['站台 · 清晨','一起修好提手','林晚和年轻人把松动的螺丝拧紧，在灯柄上缠一圈结实的布。两人一起走回站台。','这次，应该还能走很久。']]],
  ['天亮之前','陈叔结束最后一次值班。林晚把修好的灯放在站台新设的借用架上，让它继续照亮后来的人。','林晚想为这段相遇留下一个确切的结尾，陈叔却将道别交给每天照常经过的生活。','天亮时，又一个赶路的人提起了灯，走向尚未全亮的街口。',55,[['旧站台 · 黎明','最后一次检查','陈叔将值班室钥匙交给接班人，习惯性回头看台阶。林晚站在借用架旁，举起修好的旧灯。','这回不用带走了，放在这儿就好。'],['街口 · 黎明','后来的人','第一班车进站，街口的早餐铺亮起灯。一位陌生人从借用架取下旧灯，经过林晚时点头致谢。','路很长。有人照过，就亮一点。']]],
 ];
 const directions=[
  [
   {color:'傍晚灰蓝环境，纸张与灯柄保留低饱和暖色。',blocking:'@林晚 · 旅人 在站台长椅旁停步，从 @旧灯 底座取出信件，看过地名后放回夹层，再沿檐下返回。',lighting:'夕照从棚边侧入，纸面可读，背景保持柔和。',performance:'发现时短暂停顿，收信动作谨慎，不夸张惊讶。',sound:'纸张摩擦、挎包搭扣声，远处列车进站。'},
   {color:'冷灰站台与灯的暖色形成轻微对照。',blocking:'@陈叔 · 守站人 站在 @旧站台 · 雨夜 的长椅旁，收妥信件后换电池，将 @林晚 · 旅人 递来的 @旧灯 轻轻推回。',lighting:'棚下余光照见双手，旧灯亮起后补亮衣袖。',performance:'林晚郑重，陈叔自然平静；推回灯时留出一次无声对视。',sound:'电池盖轻响，站台广播与低弱风声。'},
  ],
  [
   {color:'深蓝夜色压暗背景，灯光保持柔暖。',blocking:'@林晚 · 旅人 在 @旧站台 · 雨夜 台阶前蹲低，把 @旧灯 移到台阶侧面，自己站在通行线外引导乘客。',lighting:'顶灯熄灭后短暂停顿，再由低位灯光显出台阶边缘和积水。',performance:'先观察脚下危险，再清楚缓慢地提醒，镇定而不喊叫。',sound:'电流中断的轻响、雨水滴落、乘客脚步停顿。'},
   {color:'维持深蓝背景与暖色安全通路。',blocking:'@陈叔 · 守站人 扶乘客下阶，@林晚 · 旅人 把 @旧灯 交给侧后方的年轻人；接稳后才松手，灯始终照住最后两级。',lighting:'灯光连续照亮台阶，不在交接时扫向镜头。',performance:'交接有短暂确认，林晚先看乘客站稳再回答。',sound:'扶栏摩擦、鞋底踩水，雨声延续，配乐不盖过对白。'},
  ],
  [
   {color:'夜间街口以低饱和蓝灰为底，店铺保留暖光。',blocking:'@林晚 · 旅人 停在街口边缘，望向店主借出的 @旧灯 ，看清灯罩划痕后原地停留，不阻断两人的传递。',lighting:'街灯勾出轮廓，灯罩反光轻而稳定。',performance:'从辨认到释然，用视线和轻微笑意完成，不追上去索要。',sound:'店门铃、物品放下声，远处车流。'},
   {color:'清晨灰蓝，布条与灯柄呈自然旧色。',blocking:'@林晚 · 旅人 扶稳 @旧灯 ，年轻人拧紧螺丝，再共同缠好提手；收妥工具后并肩走向站台。',lighting:'柔和晨光均匀照见双手和提手细节。',performance:'注意力留在修理上，完成后试提一次，再轻松回应。',sound:'螺丝刀与金属的轻响、布条摩擦、清晨鸟声。'},
  ],
  [
   {color:'黎明淡蓝逐渐过渡到柔和中性色。',blocking:'@陈叔 · 守站人 交出钥匙后回望台阶；@林晚 · 旅人 在 @旧站台 · 雨夜 借用架旁举起 @旧灯 ，让他看清修好的提手。',lighting:'晨光从棚外漫入，人物面部明暗柔和，旧灯仅作小面积暖色。',performance:'陈叔保留值班时的习惯动作，林晚平静表达，不刻意拥抱或哭泣。',sound:'钥匙碰响、卷帘门声、远处第一班车。'},
   {color:'@街口 · 黎明 的淡蓝晨光与早餐铺暖光共存。',blocking:'陌生人从借用架提起 @旧灯 ，向 @林晚 · 旅人 点头后走向街口；林晚留在架旁，画面缓慢拉远。',lighting:'天光逐渐明亮，灯光不闪烁，人物背影融入街景。',performance:'致谢简短自然，林晚轻轻点头，把结尾交给继续运行的城市。',sound:'列车进站、早餐铺开门，旁白结束后保留环境声。'},
  ],
 ];
 const shared=['actor','keeper','scene','crossroad','lamp'];
 story.scriptSeries={version:1,title:'末班灯',logline:'一位错过末班车的旅人借到一盏旧灯，在归还与传递的途中学会把善意留给后来的人。',setting:'现代城市的旧站台。故事以一盏可借用的旧灯连接陌生人，每一集围绕一次具体的帮助推进；不引入超自然设定，关系从克制的接受走向主动的传递。',targetSeconds:{min:30,max:60},stage:'assets',sharedAssetIds:shared,episodes:[{id:'story-episode-1',number:1,primary:true,assetIds:shared,outline:{event:'错过末班车的林晚在雨夜收到守站人借出的一盏灯，终于找到回家的路。',conflict:'不愿麻烦别人的林晚必须接受陌生人的帮助。',hook:'回家后，她发现灯座里藏着一封旧信。'}},...rows.map(([title,event,conflict,hook,seconds,scenes],index)=>{const number=index+2,document={revision:1,title,logline:event,scenes:scenes.map(([sceneTitle,shotTitle,action,dialogue],i)=>({id:'episode-'+number+'-scene-'+(i+1),title:sceneTitle,shots:[{id:'episode-'+number+'-shot-'+(i+1),title:shotTitle,action,dialogue,seconds:i===0?Math.floor(seconds/2):Math.ceil(seconds/2),storyboardFields:{...directions[index][i],prompt:[action,directions[index][i].blocking,directions[index][i].lighting,directions[index][i].performance,directions[index][i].sound,dialogue].join('\n')}}]}))};return {id:'story-episode-'+number,number,primary:false,document,versions:[{...structuredClone(document),createdAt:null}],estimatedSeconds:seconds,assetIds:number===3?['actor','keeper','scene','lamp']:shared,outline:{event,conflict,hook}}})]};
 return {project:'末班灯 · 全剧示例',projectKind:'drama',nodes,edges:recipe.edges,clips:recipe.clips};
}
