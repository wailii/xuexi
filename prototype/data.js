// 课程数据：大模型这门取自 universal-tutor 的 rag-systems 卡带（标题、依赖、讲解要点、出处都是原样）
// 进度是演示用的，日期一律相对今天（0 = 今天，-1 = 昨天）

const SRC = {
  lewis: { name: "Lewis et al. 2020 · RAG 原始论文", url: "https://arxiv.org/abs/2005.11401", note: "维基百科提前用 FAISS 建好稠密向量索引，提问时检索器只取 top-k" },
  langchain: { name: "LangChain 官方教程 · Build a RAG App", url: "https://python.langchain.com/docs/tutorials/rag/", note: "流程拆成 Indexing（Load→Split→Embed→Store）和 Retrieval and Generation 两条链" },
  unstructured: { name: "Unstructured · RAG 生产实践", url: "https://unstructured.io/insights/rag-systems-best-practices-unstructured-data-pipeline", note: "离线写入看吞吐，在线检索看延迟，拆开后能单独评测检索" },
  nvidia: { name: "NVIDIA · RAG 101", url: "https://developer.nvidia.com/blog/rag-101-demystifying-retrieval-augmented-generation-pipelines/", note: "把写入和查询当成两条独立流水线来讲" },
  lost: { name: "Liu et al. · Lost in the Middle", url: "https://arxiv.org/abs/2307.03172", note: "信息放在长上下文中间时，模型最容易漏掉" },
  lcvsrag: { name: "Long Context vs. RAG for LLMs", url: "https://arxiv.org/abs/2501.01880", note: "资源够时长上下文常更准，RAG 成本低得多，没有总赢的一方" },
  contextual: { name: "Anthropic · Contextual Retrieval", url: "https://www.anthropic.com/news/contextual-retrieval", note: "知识库小于 20 万 token 可以整个放进提示词，更大再上检索" },
};

const RAG_NODES = [
  ["RAG-01", "为什么需要 RAG：四大局限", []], ["RAG-02", "RAG 本质：检索加生成", ["RAG-01"]], ["RAG-03", "标准流水线全景", ["RAG-02"]],
  ["RAG-04", "离线索引与在线检索两阶段", ["RAG-03"]], ["RAG-05", "何时用 RAG，对比长上下文和微调", ["RAG-02"]], ["RAG-06", "知识和行为二分", ["RAG-05"]],
  ["RAG-07", "数据接入与来源盘点", ["RAG-04"]], ["RAG-08", "文档解析与版面理解 OCR", ["RAG-07"]], ["RAG-09", "数据清洗、去重与元数据", ["RAG-07"]],
  ["RAG-10", "增量更新与索引刷新", ["RAG-09", "RAG-04"]], ["RAG-11", "切块的核心矛盾：召回对比完整", ["RAG-08"]], ["RAG-12", "固定切块与重叠窗口", ["RAG-11"]],
  ["RAG-13", "语义切块与递归切块", ["RAG-11"]], ["RAG-14", "父子层级切块 small to big", ["RAG-13"]], ["RAG-15", "切块策略选型", ["RAG-12", "RAG-13", "RAG-14"]],
  ["RAG-16", "嵌入模型原理与语义相似度", ["RAG-11"]], ["RAG-17", "嵌入模型选型：通用对比领域", ["RAG-16"]], ["RAG-18", "向量库 ANN 索引：HNSW 对比 IVF", ["RAG-16"]],
  ["RAG-19", "元数据过滤与分区", ["RAG-18", "RAG-09"]], ["RAG-20", "向量库自建对比采购", ["RAG-18"]], ["RAG-21", "稠密检索原理与盲区", ["RAG-17", "RAG-18"]],
  ["RAG-22", "稀疏检索 BM25 倒排", ["RAG-11"]], ["RAG-23", "混合检索与融合 RRF", ["RAG-21", "RAG-22"]], ["RAG-24", "TopK 与检索深度调参", ["RAG-23"]],
  ["RAG-25", "查询改写总览：语义鸿沟", ["RAG-21"]], ["RAG-26", "查询扩展：多查询与 HyDE", ["RAG-25"]], ["RAG-27", "查询分解与 step back 多跳", ["RAG-25"]],
  ["RAG-28", "自适应检索与置信度门控", ["RAG-25", "RAG-23"]], ["RAG-29", "重排原理 cross encoder", ["RAG-23"]], ["RAG-30", "重排选型与代价", ["RAG-29"]],
  ["RAG-31", "上下文压缩与过滤", ["RAG-29"]], ["RAG-32", "上下文构建与中间迷失", ["RAG-31", "RAG-24"]], ["RAG-33", "生成与提示工程：约束作答", ["RAG-32"]],
  ["RAG-34", "引用归因防幻觉", ["RAG-33"]], ["RAG-35", "忠实度增强 Self-RAG、CRAG", ["RAG-34", "RAG-28"]], ["RAG-36", "评测三层指标", ["RAG-34", "RAG-24"]],
  ["RAG-37", "评测框架 RAGAS 与金标集", ["RAG-36"]], ["RAG-38", "生产可观测与持续评测", ["RAG-37"]], ["RAG-39", "RAG 安全：注入、投毒、红队", ["RAG-33", "RAG-07"]],
  ["RAG-40", "权限与隐私：RBAC 过滤、PII", ["RAG-19", "RAG-39"]], ["RAG-41", "架构演进：Agentic、GraphRAG", ["RAG-28", "RAG-35", "RAG-23"]], ["RAG-42", "上下文工程与生产权衡", ["RAG-41", "RAG-38", "RAG-40", "RAG-10"]],
  ["RAG-43", "成本、延迟、吞吐三角", ["RAG-03", "RAG-04"]], ["RAG-44", "缓存层设计", ["RAG-16", "RAG-33"]], ["RAG-45", "端到端延迟预算与流式架构", ["RAG-24", "RAG-29"]],
  ["RAG-46", "结构化数据与表格 RAG", ["RAG-07", "RAG-23"]], ["RAG-47", "多模态 RAG", ["RAG-08", "RAG-17"]], ["RAG-48", "失败模式与归因调试", ["RAG-21", "RAG-32", "RAG-34"]],
  ["RAG-49", "检索指标为何不等于好答案", ["RAG-36"]], ["RAG-50", "金标集与评测数据工程", ["RAG-37"]], ["RAG-51", "嵌入与索引的版本管理", ["RAG-10", "RAG-17", "RAG-18"]],
  ["RAG-52", "反馈闭环与数据飞轮", ["RAG-38"]], ["RAG-53", "线上变更：灰度、A/B、回滚", ["RAG-38", "RAG-42"]],
];

const PHY_NODES = [
  ["PHY-01", "测量、单位与数量级", []], ["PHY-02", "位移、速度和加速度", ["PHY-01"]], ["PHY-03", "抛体运动", ["PHY-02"]],
  ["PHY-04", "牛顿三定律", ["PHY-02"]], ["PHY-05", "摩擦力与受力分析", ["PHY-04"]], ["PHY-06", "圆周运动", ["PHY-05"]],
  ["PHY-07", "功与能", ["PHY-05"]], ["PHY-08", "能量守恒", ["PHY-07"]], ["PHY-09", "动量与碰撞", ["PHY-08"]],
  ["PHY-10", "转动与角动量", ["PHY-09"]], ["PHY-11", "万有引力", ["PHY-06"]], ["PHY-12", "简谐振动", ["PHY-07"]],
  ["PHY-13", "机械波", ["PHY-12"]], ["PHY-14", "流体", ["PHY-05"]],
];

// 宋朝这门是建课演示的产物：先排出 22 个，补漏时再加 2 个（标了 late）
const SONG_AREAS = ["开国与制度", "边防与战和", "改革与党争", "经济与社会", "文化与思想", "怎么评价宋"];
const SONG_NODES = [
  ["SONG-01", "宋初怎么收兵权：陈桥兵变与杯酒释兵权", [], 0], ["SONG-02", "「祖宗之法」：防弊为先", ["SONG-01"], 0], ["SONG-03", "科举扩张与文官政治", ["SONG-02"], 0],
  ["SONG-04", "宰相的权被拆成几份", ["SONG-02"], 0], ["SONG-05", "募兵制与冗兵", ["SONG-01"], 0],
  ["SONG-06", "澶渊之盟：岁币换和平划不划算", ["SONG-05"], 1], ["SONG-07", "宋夏战争与西北边防", ["SONG-05"], 1], ["SONG-08", "联金灭辽与靖康之变", ["SONG-06"], 1],
  ["SONG-09", "南渡与宋金对峙", ["SONG-08"], 1], ["SONG-10", "蒙古南下与崖山", ["SONG-09"], 1],
  ["SONG-11", "庆历新政", ["SONG-03", "SONG-04"], 2], ["SONG-12", "王安石变法", ["SONG-11"], 2], ["SONG-13", "新旧党争", ["SONG-12"], 2],
  ["SONG-14", "占城稻与江南开发", ["SONG-01"], 3], ["SONG-15", "坊市制瓦解与城市商业", ["SONG-14"], 3], ["SONG-16", "交子与会子：纸币为何失控", ["SONG-15"], 3],
  ["SONG-17", "海外贸易与市舶司", ["SONG-15"], 3], ["SONG-18", "宋代财政：钱从哪来、花到哪去", ["SONG-05", "SONG-16"], 3, "late"],
  ["SONG-19", "印刷术与书籍普及", ["SONG-01"], 4], ["SONG-20", "理学：从二程到朱熹", ["SONG-03"], 4], ["SONG-21", "宋词与士大夫生活", ["SONG-03"], 4],
  ["SONG-22", "指南针、火药与《梦溪笔谈》", ["SONG-19"], 4],
  ["SONG-23", "「积贫积弱」站不站得住", ["SONG-05", "SONG-06", "SONG-18"], 5], ["SONG-24", "唐宋变革论：宋是不是近世的开端", ["SONG-15", "SONG-20"], 5, "late"],
];

const SONG_SOURCES = [
  ["宋", "《宋史》", "元 · 脱脱等"], ["续", "《续资治通鉴长编》", "南宋 · 李焘"], ["剑", "剑桥中国史 · 宋代卷", "Twitchett、Smith 编"],
  ["祖", "《祖宗之法》", "邓小南"], ["转", "《中国转向内在》", "刘子健"], ["城", "《宋代城市研究》", "包伟民"],
  ["王", "《王安石变法》", "漆侠"], ["唐", "《概括的唐宋时代观》", "内藤湖南"], ["细", "《细说宋朝》", "虞云国"],
  ["C", "中国历代人物传记资料库 CBDB", "哈佛大学等"],
];

const COURSES = [
  {
    id: "llm", cat: "大模型", title: "RAG 系统设计", cover: "img/cover-llm.jpg",
    nodes: RAG_NODES,
    states: { "RAG-01": "mastered", "RAG-02": "mastered", "RAG-03": "learned", "RAG-04": "learning" },
    due: ["RAG-03"], current: "RAG-04", script: "rag",
    todayTitle: "复习 03 · 学 04 离线索引与在线检索",
    convs: [
      { d: -1, title: "复习 02 · 学 03 标准流水线全景", tag: "4 分", sum: ["02 复习通过，算掌握了", "03 画出了离线、在线两条线", "没想到要加重排：记下了"] },
      { d: -2, title: "问：向量库和普通数据库有什么不一样", tag: "提问", sum: ["普通数据库按值精确查，向量库按「像不像」找最近的", "第 18 节会细讲索引"] },
      { d: -3, title: "复习 01 · 学 02 RAG 本质", tag: "4 分", sum: ["01 复习通过，算掌握了", "02 分清了检索错和生成错"] },
      { d: -4, title: "学 01 为什么需要 RAG", tag: "4 分", sum: ["讲清了知识截止、幻觉、没出处、私有数据四个局限"] },
    ],
  },
  {
    id: "phy", cat: "物理", title: "经典力学", cover: "img/cover-physics.jpg",
    nodes: PHY_NODES,
    states: { "PHY-01": "mastered", "PHY-02": "mastered", "PHY-03": "mastered", "PHY-04": "learned", "PHY-05": "mastered", "PHY-06": "mastered", "PHY-07": "learned" },
    due: ["PHY-04", "PHY-07"], current: "PHY-08",
    todayTitle: "复习 04、07 · 学 08 能量守恒",
    convs: [
      { d: -2, title: "学 07 功与能", tag: "4 分", sum: ["会用「力乘以力方向上的位移」算功", "下次复习今天"] },
      { d: -3, title: "复习 04 牛顿三定律", tag: "3 分", sum: ["马拉车那题答错：以为两个力能抵消", "退回学习中，再考一次"] },
      { d: -5, title: "学 06 圆周运动", tag: "5 分", sum: ["向心力不是一种新的力，是合力的效果"] },
      { d: -7, title: "学 05 摩擦力与受力分析", tag: "4 分", sum: ["静摩擦力大小跟着推力变，有上限"] },
    ],
  },
];

const SONG_COURSE = {
  id: "song", cat: "历史", title: "宋朝：为什么富而不强", cover: "img/cover-song.jpg",
  nodes: SONG_NODES.map(([id, t, deps]) => [id, t, deps]), areas: SONG_AREAS, areaOf: Object.fromEntries(SONG_NODES.map((n) => [n[0], n[3]])),
  states: {}, due: [], current: "SONG-01", script: "song",
  todayTitle: "学 01 宋初怎么收兵权",
  convs: [],
};
