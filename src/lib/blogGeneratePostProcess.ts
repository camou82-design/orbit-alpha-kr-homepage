import type { BlogGeneratePayload } from "@/lib/blogGenerate";

function splitIntoSentences(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  // lookbehind 기반으로 마침표/물음표/느낌표/… 뒤 공백에서 분리
  const parts = t.split(/(?<=[.!?…])\s+/u).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [t];
}

function polishIntroFirstSentence(intro: string): string {
  const sentences = splitIntoSentences(intro);
  if (sentences.length <= 0) return intro;
  const first = sentences[0] ?? intro;
  // "순간이 있습니다"는 글감 설명처럼 튀는 경우가 있어서 "때가 있습니다" 선호
  const fixed = first.replace(/순간이 있습니다/u, "때가 있습니다").replace(/순간/u, "때");
  if (fixed === first) return intro;
  sentences[0] = fixed;
  return sentences.join(" ");
}

function rankTitles(titles: [string, string, string]): [string, string, string] {
  const arr = [...titles];

  const score = (t: string) => {
    const direct =
      /(뛰|호조|급증|상승)/u.test(t) && /(왜|않을까|아닐까)/u.test(t) && /(불안|무섭|걱정)/u.test(t);
    const explain = /(:|—)|그런데|하지만|다만|그래도/u.test(t);
    const safe = /이유|어려운|쉽지|힘든/u.test(t);

    let s = 0;
    if (direct) s += 120;
    else if (explain) s += 70;
    else if (safe) s += 40;

    if (/(왜|않을까|아닐까)/u.test(t)) s += 18;
    if (/(불안|무섭|걱정)/u.test(t)) s += 18;
    if (/(뛰|호조|급증|상승)/u.test(t)) s += 10;

    // 너무 길면 클릭/인포에 불리하다고 보고 미세 페널티
    if (t.length > 28) s -= Math.min(20, Math.floor((t.length - 28) / 3));
    return s;
  };

  arr.sort((a, b) => score(b) - score(a));
  return [arr[0]!, arr[1]!, arr[2]!];
}

function shortenInfographicTitle(bestTitle: string): string {
  let t = bestTitle.trim();
  // "한국 경제는" 같은 중간 수식 제거
  t = t.replace(/한국\s*경제는\s*/u, "");
  // 너무 길면 잘라서 인포 2줄 제목에서 읽히게
  if (t.length > 24) t = t.slice(0, 24).trim();
  // 콜론/대시가 있으면 앞쪽을 메인 제목으로
  t = t.split(":")[0]!;
  t = t.split("—")[0]!;
  if (t.length > 24) t = t.slice(0, 24).trim();
  return t || bestTitle;
}

/** 구어체·날것 필러 제거 후, 필요 시 완곡한 블로그형 첫 문장 유도 */
export function polishOpinionSection(opinion: string): string {
  const original = opinion.trim();
  if (!original) return original;
  let t = original.replace(/^(음|어|그런데|솔직히|정확히|뭐야|뭐)[\s,，.]+/u, "");
  if (!t.trim()) return original;
  const firstPara = t.split(/\n/)[0]?.trim() ?? t;
  if (/^개인적으로는\s/.test(firstPara)) return t;
  if (/^(이|그|저)\s/.test(firstPara) && firstPara.length < 8) {
    return `개인적으로는 ${t}`;
  }
  if (/^(헷갈|복잡|어렵|애매|모르겠)/u.test(firstPara)) {
    return `개인적으로는 ${t}`;
  }
  return t;
}

/** 정리 끝부분에 생활 체감·완곡형 마무리가 부족할 때만 한 문장 보강 */
export function polishSummarySection(summary: string, topic: string): string {
  const t = summary.trim();
  if (!t) return t;
  const tail = t.slice(Math.max(0, t.length - 160));
  if (/생활|체감|장바구니|기름값|물가|환율|일상|지갑|느껴집니다|것\s*같습니다|보입니다/u.test(tail)) {
    return t;
  }
  const sentences = splitIntoSentences(t);
  const last = sentences[sentences.length - 1] ?? t;
  const tooReporty = /(결국\s*지금\s*필요한|정리하자면|따라서\s*|요약하면|필요한\s*건)/u.test(last);
  if (tooReporty) {
    sentences[sentences.length - 1] = pickSummaryClosing(topic);
    return sentences.join(" ");
  }
  return `${t} ${pickSummaryClosing(topic)}`;
}

function pickSummaryClosing(topic: string): string {
  if (/환율|원화|달러|약세|강세/u.test(topic)) {
    return "결국 숫자만 보면 답이 보이는데, 생활비 부담까지 같이 떠올려야 체감이 맞는 것 같습니다.";
  }
  if (/유가|기름|휘발유/u.test(topic)) {
    return "그래서 지표만 좋아 보여도, 장바구니와 기름값까지 묶어 보면 이해가 한결 쉬운 것 같습니다.";
  }
  if (/물가|체감/u.test(topic)) {
    return "뉴스 한 줄과 장바구니 한 번은 같은 날의 다른 얼굴처럼 느껴지는 것 같습니다.";
  }
  return "결국 좋은 통계가 실제 생활의 변화로 이어져야 사람들도 비로소 경제가 나아지고 있다고 느낄 수 있을 것 같습니다.";
}

/** 제미나이용: 고정 줄바꿈 구조로 재구성 */
export function structureInfographicPrompt(topic: string, raw: string, bestTitle?: string): string {
  const line1 = "디지털 금융 자동화 연구소 | 경제 브리핑";
  const titleLine = shortenInfographicTitle(bestTitle ? bestTitle : extractInfographicTitle(raw, topic));
  const line3 = "밝은 배경의 한국 경제 블로그용 카드형 4칸 인포그래픽.";
  const cards = extractFourCardLabels(raw, topic);
  // 카드4는 주제에 더 직접 붙는 질문형 문장으로 후처리(너무 generic하면 교체)
  if (cards.length >= 4) {
    cards[3] = refineCard4Question(topic, cards[3]!);
  }
  const styleLine =
    "깔끔한 플랫 아이콘, 네이비와 오렌지 포인트, 차분한 경제 블로그 대표 이미지 느낌, 유튜브 썸네일처럼 과장하지 말 것.";
  return [line1, titleLine, line3, ...cards.map((c, i) => `${i + 1}. ${c}`), styleLine].join("\n");
}

function extractInfographicTitle(raw: string, topic: string): string {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.includes("|") && line.includes("브리핑")) continue;
    if (/^밝은\s*배경/u.test(line)) continue;
    if (/^\d+[\.)]/.test(line)) continue;
    if (line.length >= 4 && line.length <= 48) return line;
  }
  const t = topic.replace(/\s+/g, " ").trim();
  return t.slice(0, 42) || "경제 브리핑";
}

function extractFourCardLabels(raw: string, topic: string): string[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const numbered = lines
    .filter((l) => /^\d+[\.)]\s*/.test(l))
    .map((l) => l.replace(/^\d+[\.)]\s*/, "").trim())
    .filter(Boolean);
  if (numbered.length >= 4) return numbered.slice(0, 4);

  const bullets = lines.filter((l) => /^[-•*]\s*/.test(l)).map((l) => l.replace(/^[-•*]\s*/, "").trim());
  if (bullets.length >= 4) return bullets.slice(0, 4);

  const t = topic.slice(0, 24);
  return [
    `${t || "이슈"} 핵심 한 줄`,
    "시장 반응·심리",
    "수입물가·생활비 체감",
    refineCard4Question(topic, ""),
  ];
}

function refineCard4Question(topic: string, currentCard4: string): string {
  const card4 = (currentCard4 ?? "").trim();
  const isGeneric =
    !card4 ||
    /앞으로\s*볼\s*포인트|정책\s*대응|질문\s*하나|포인트$/u.test(card4) ||
    card4.length <= 5;

  // 질문형 문장(과장 없이, 4~6어절 느낌)
  const t = topic.replace(/\s+/g, " ").trim();
  if (!isGeneric) return card4;

  if (/수출|경상수지/u.test(t)) return "다음엔 체감 신호를 볼까?";
  if (/환율|원화|달러|약세|강세/u.test(t)) return "생활물가는 언제 움직일까?";
  if (/물가|체감/u.test(t)) return "생활물가는 언제 안정될까?";
  if (/유가|기름|휘발유/u.test(t)) return "기름값은 언제 내려올까?";
  if (/금리|한은|연준/u.test(t)) return "금리는 언제 체감될까?";

  return "다음 지표는 무엇을 볼까?";
}

/** 검색 친화적·주제 직결형으로 태그 보정(8개 유지) */
export function refineTagsForSearch(tags: string[], topic: string): string[] {
  const compact = topic.replace(/\s+/g, "");
  const out: string[] = [];
  const seen = new Set<string>();

  const isVague = (body: string) => {
    const b = body.trim();
    if (!b) return true;
    if (b.startsWith("경제메모")) return true;
    if (/(이슈)$/u.test(b)) return true;
    return (
      b === "경제" ||
      b === "이슈" ||
      b === "분석" ||
      b === "메모" ||
      b === "뉴스" ||
      b === "오늘" ||
      b === "정보" ||
      b === "이야기" ||
      b === "한줄"
    );
  };

  const push = (raw: string) => {
    let s = raw.trim().replace(/^#/, "");
    if (!s) return;
    s = expandTagByTopic(s, compact, topic);
    if (isVague(s)) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(`#${s}`);
  };

  for (const tag of tags) push(tag);
  for (const f of deriveSearchTagsFromTopic(topic)) {
    if (out.length >= 8) break;
    push(f.replace(/^#/, ""));
  }

  // 마지막으로 주제 단어를 검색형 키워드로 확장
  const topicWords = Array.from(
    new Set(topic.split(/[\s,，]+/).map((x) => x.trim()).filter((x) => x.length >= 2 && x.length <= 14)),
  );
  for (const w of topicWords) {
    if (out.length >= 8) break;
    let mapped = expandTagByTopic(w, compact, topic);
    if (isVague(mapped)) continue;
    if (!/(전망|기업|물가|상승|강세|동향)$/u.test(mapped)) mapped = `${mapped}전망`;
    if (isVague(mapped)) continue;
    push(mapped);
  }

  let n = 0;
  while (out.length < 8) {
    push(`경제브리핑${++n}`);
  }
  return out.slice(0, 8);
}

function expandTagByTopic(tag: string, topicCompact: string, topicFull: string): string {
  const lower = tag.toLowerCase();
  if (tag === "환율" || lower === "환율") {
    if (/약세|원화|원\/달러|고점/u.test(topicFull)) return "환율상승";
    if (/강세|달러당/u.test(topicFull)) return "환율강세";
    return "환율전망";
  }
  if (tag === "수출" || tag === "수입") return tag === "수출" ? "수출기업" : "수입물가";
  if (tag === "물가") return "생활물가";
  if (tag === "유가" || tag === "기름") return "유가전망";
  if (tag === "금리") return "금리인상";
  if (tag === "증시") return "증시전망";
  if (tag === "정책") return "경제정책";
  return tag;
}

function deriveSearchTagsFromTopic(topic: string): string[] {
  const s: string[] = [];
  if (/환율|달러|원화|약세|강세/u.test(topic)) s.push("환율브리핑");
  if (/물가|체감|장바구니/u.test(topic)) s.push("생활물가");
  if (/수출/u.test(topic)) s.push("수출기업");
  if (/수입/u.test(topic)) s.push("수입물가");
  if (/경상수지/u.test(topic) && s.length < 8) s.push("수출기업");
  if (/유가|기름|휘발유/u.test(topic)) s.push("국제유가");
  if (/금리|한은|연준/u.test(topic)) s.push("금리동향");
  return s;
}

/** 쓰레드 유입형을 "블로그 유입" CTA 톤으로 보정 (링크 URL은 절대 넣지 않음) */
export function polishTrafficVersion(traffic: string): string {
  let t = traffic.trim();
  if (!t) return t;
  t = t.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  const ctaLine1 = "겉으로는 좋아 보이는 숫자와 실제 체감이 왜 다른지 블로그에 풀어봤습니다.";
  const ctaLine2 = "링크는 댓글이나 프로필에 남겨두겠습니다.";
  const commentBlockHeader = "댓글용 링크 문구:";
  const commentLine1 = "자세한 내용은 블로그에 정리했습니다.";
  const commentLine2 = "블로그 링크:";

  // 기존에 "자세한 내용은 블로그에..." 류로 CTA가 끝나 있으면 그 뒤를 잘라낸 뒤 재부착
  const cutIdx = t.indexOf("자세한 내용은 블로그에");
  if (cutIdx >= 0) t = t.slice(0, cutIdx).trim();

  // CTA 보정
  if (!/[.!?…]$/.test(t)) t = `${t}.`;
  if (!t.includes(ctaLine1)) t = `${t}\n${ctaLine1}`;
  if (!t.includes(ctaLine2)) t = `${t}\n${ctaLine2}`;

  // 댓글용 링크 문구(링크 URL은 넣지 않고 자리만 비움)
  if (!t.includes(commentBlockHeader)) {
    t = `${t}\n\n${commentBlockHeader}\n${commentLine1}\n${commentLine2}`;
  }

  return t;
}

export function postProcessBlogPayload(p: BlogGeneratePayload, topic: string): BlogGeneratePayload {
  const rankedTitles = rankTitles(p.titles);
  const article: BlogGeneratePayload["article"] = {
    ...p.article,
    intro: polishIntroFirstSentence(p.article.intro),
    opinion: polishOpinionSection(p.article.opinion),
    summary: polishSummarySection(p.article.summary, topic),
  };
  const infographic_prompt = p.infographic_prompt.trim()
    ? structureInfographicPrompt(topic, p.infographic_prompt, rankedTitles[0] ?? undefined)
    : "";
  const tags = refineTagsForSearch(p.tags, topic);
  const threads = {
    body_version: p.threads.body_version,
    traffic_version: polishTrafficVersion(p.threads.traffic_version),
  };
  return {
    ...p,
    article,
    titles: rankedTitles,
    infographic_prompt,
    tags,
    threads,
  };
}
